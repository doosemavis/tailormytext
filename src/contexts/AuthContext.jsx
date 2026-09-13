import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../utils/supabase";
import { getRolePermissions } from "../config/roles";
import { setUserScope, clearUserScope } from "../utils/storage";
import { track } from "../utils/track";

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState("user");
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  // Pending account-deletion state, mirrored from profiles table.
  // null = active account; ISO string = scheduled deletion timestamp.
  const [deletionRequestedAt, setDeletionRequestedAt] = useState(null);
  const [deletionEffectiveAt, setDeletionEffectiveAt] = useState(null);
  // True when a Supabase password-recovery flow is in progress (user clicked
  // the email reset link). The user is technically signed in via the recovery
  // token, but we force them through a "set new password" UI before letting
  // them use the app normally.
  const [isRecovering, setIsRecovering] = useState(false);
  // Guard: prevents onAuthStateChange from restoring a session after manual sign-out
  const signedOutRef = useRef(false);

  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role, deletion_requested_at, deletion_effective_at, is_owner")
        .eq("id", userId)
        .single();
      if (!error && data) return data;
    } catch {}
    return { role: "user", deletion_requested_at: null, deletion_effective_at: null, is_owner: false };
  }, []);

  // Refetches just the deletion fields. Used after the user reactivates
  // from the banner — clears the pending state without a full re-auth.
  const refreshDeletionStatus = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("deletion_requested_at, deletion_effective_at")
      .eq("id", user.id)
      .single();
    setDeletionRequestedAt(data?.deletion_requested_at ?? null);
    setDeletionEffectiveAt(data?.deletion_effective_at ?? null);
  }, [user]);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      // Password recovery: Supabase fires this when the URL contains a
      // recovery token (user clicked the reset email link). The session
      // is established, but we want to force them through the password
      // reset UI before they can use the app normally.
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovering(true);
        if (window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }

      if (event === "SIGNED_IN" && window.location.hash.includes("access_token")) {
        window.history.replaceState(null, "", window.location.pathname);
      }

      if (session?.user && !signedOutRef.current) {
        // Set the user synchronously — do NOT await before this. In React
        // StrictMode dev, the effect mounts → unmounts → re-mounts; an
        // await here means the first handler bails on `mounted=false`
        // before setUser runs, and the second subscription doesn't re-fire
        // INITIAL_SESSION because the SDK already delivered it. Fetch the
        // role + deletion status in the background and update separately.
        // Keep the same object when nothing meaningful changed (routine
        // TOKEN_REFRESHED / INITIAL_SESSION re-deliveries). Effects keyed on
        // `user` otherwise re-run on every refresh — the reading-position
        // restore, for one, forces a whole-book layout each time.
        const next = session.user;
        setUser((prev) => (
          prev && prev.id === next.id && prev.updated_at === next.updated_at && prev.email_confirmed_at === next.email_confirmed_at
            ? prev
            : next
        ));
        setUserScope(session.user.id);
        fetchProfile(session.user.id).then(profile => {
          if (!mounted) return;
          setRole(profile.role ?? "user");
          setIsOwner(!!profile.is_owner);
          setDeletionRequestedAt(profile.deletion_requested_at ?? null);
          setDeletionEffectiveAt(profile.deletion_effective_at ?? null);
        });
      } else if (!session?.user || signedOutRef.current) {
        setUser(null);
        setRole("user");
        setIsOwner(false);
        setDeletionRequestedAt(null);
        setDeletionEffectiveAt(null);
        clearUserScope();
      }

      setLoading(false);
    });

    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [fetchProfile]);

  // Use raw fetch instead of SDK for email auth — sb_publishable_ keys cause
  // the SDK's signInWithPassword/signUp to hang without making a network request
  const signIn = useCallback(async (email, password) => {
    try {
      const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) return { data: null, error: { message: json.error_description || json.msg || "Invalid email or password." } };
      // Write session to localStorage in the exact shape the SDK's
      // GoTrueClient expects on restore. Includes expires_in (was missing
      // before) which the parser uses to compute refresh windows. Avoids
      // calling supabase.auth.setSession() because that hits /auth/v1/user
      // and hangs against this project's `sb_publishable_` key.
      const storageKey = `sb-${SUPA_URL.split("//")[1].split(".")[0]}-auth-token`;
      localStorage.setItem(storageKey, JSON.stringify({
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_at: json.expires_at,
        expires_in: json.expires_in,
        token_type: json.token_type,
        user: json.user,
      }));
      signedOutRef.current = false;
      setUser(json.user);
      setUserScope(json.user.id);
      fetchProfile(json.user.id).then(profile => {
        setRole(profile.role ?? "user");
        setIsOwner(!!profile.is_owner);
        setDeletionRequestedAt(profile.deletion_requested_at ?? null);
        setDeletionEffectiveAt(profile.deletion_effective_at ?? null);
      });
      return { data: json, error: null };
    } catch (err) {
      return { data: null, error: { message: "Something went wrong. Please try again." } };
    }
  }, [fetchProfile]);

  const signUp = useCallback(async (email, password) => {
    try {
      // Block re-signup with an email that has a pending deletion request.
      // Otherwise users could delete their account and immediately re-signup
      // as free, creating confusing data state during the grace period.
      const { data: pending, error: pendingErr } = await supabase
        .rpc("email_has_pending_deletion", { check_email: email });
      if (!pendingErr && pending === true) {
        return { data: null, error: { message: "This email has an account scheduled for deletion. Sign in to reactivate, or wait until the scheduled deletion date." } };
      }

      const res = await fetch(`${SUPA_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) return { data: null, error: { message: json.error_description || json.msg || "Signup failed.", status: res.status } };
      if (json.access_token && json.user) {
        const storageKey = `sb-${SUPA_URL.split("//")[1].split(".")[0]}-auth-token`;
        localStorage.setItem(storageKey, JSON.stringify({
          access_token: json.access_token,
          refresh_token: json.refresh_token,
          expires_at: json.expires_at,
          expires_in: json.expires_in,
          token_type: json.token_type,
          user: json.user,
        }));
        signedOutRef.current = false;
        setUser(json.user);
        setUserScope(json.user.id);
        fetchProfile(json.user.id).then(profile => {
          setRole(profile.role ?? "user");
          setDeletionRequestedAt(profile.deletion_requested_at ?? null);
          setDeletionEffectiveAt(profile.deletion_effective_at ?? null);
        });
        track("signup");
      }
      return { data: json, error: null };
    } catch (err) {
      return { data: null, error: { message: "Something went wrong. Please try again." } };
    }
  }, [fetchProfile]);

  const signOut = useCallback(() => {
    // Prevent onAuthStateChange from re-setting user from SDK's in-memory cache
    signedOutRef.current = true;
    // Clear state immediately — don't await Supabase SDK which hangs with sb_publishable_ keys
    const storageKey = `sb-${SUPA_URL.split("//")[1].split(".")[0]}-auth-token`;
    localStorage.removeItem(storageKey);
    setUser(null);
    setRole("user");
    setIsOwner(false);
    setDeletionRequestedAt(null);
    setDeletionEffectiveAt(null);
    clearUserScope();
    // Fire-and-forget — best effort server-side session revocation
    supabase.auth.signOut().catch(() => {});
  }, []);

  const resetPassword = useCallback(async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
    return { data, error };
  }, []);

  // Called from the recovery flow's "set new password" view. The user is
  // already signed in via the recovery token, so updateUser works without
  // re-auth. Caller is responsible for clearing recovery state on success.
  const updatePassword = useCallback(async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    return { data, error };
  }, []);

  // Caller (AuthModal after successful password reset) clears the recovery
  // flag so the modal can dismiss and the user lands in the normal app.
  const clearRecovery = useCallback(() => setIsRecovering(false), []);

  const signInWithOAuth = useCallback(async (provider) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    return { data, error };
  }, []);

  const permissions = getRolePermissions(role);

  return (
    <AuthContext.Provider value={{ user, role, isOwner, permissions, loading, signUp, signIn, signOut, resetPassword, updatePassword, signInWithOAuth, deletionRequestedAt, deletionEffectiveAt, refreshDeletionStatus, isRecovering, clearRecovery }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
