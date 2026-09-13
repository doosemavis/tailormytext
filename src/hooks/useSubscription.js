import { useState, useCallback, useEffect } from "react";
import { FREE_UPLOAD_LIMIT } from "../config/constants";
import { getRolePermissions } from "../config/roles";
import { supabase } from "../utils/supabase";
import { storageGet, storageSet } from "../utils/storage";

// Plan/status come from the public.subscriptions table, populated by the
// stripe-webhook edge function. The client never writes to that table —
// state changes happen via Stripe (Checkout starts a sub, cancel-subscription
// edge function ends one) and propagate back through the webhook + realtime.
//
// Upload counter is server-authoritative now (profiles.uploads_this_month,
// reset monthly). Client mirrors the server value via check_upload_allowed
// RPC; record_upload increments after successful upload.
export function useSubscription(role, user) {
  const [subRow, setSubRow] = useState(null);
  const [subLoaded, setSubLoaded] = useState(false);

  const [uploadsUsed, setUploadsUsed] = useState(0);
  const [uploadLimit, setUploadLimit] = useState(FREE_UPLOAD_LIMIT);
  const [maxFileSize, setMaxFileSize] = useState(26214400); // 25 MB default
  const [uploadsLoaded, setUploadsLoaded] = useState(false);

  // Post-deletion lockout (anti-abuse): if this email had its account deleted
  // within the last 6 months, free-tier benefits are suspended until the
  // lockout expires or they subscribe. ISO timestamp string (or null).
  const [lockoutUntil, setLockoutUntil] = useState(null);
  const [lockoutLoaded, setLockoutLoaded] = useState(false);

  // Gifted Pro access (granted by owner/admin via grant_pro_access RPC).
  // ISO timestamp; treated as Pro while in the future. No real Stripe sub.
  const [proGrantUntil, setProGrantUntil] = useState(null);
  const [proGrantLoaded, setProGrantLoaded] = useState(false);

  // Owner-only "view as Free" toggle — lets the owner test the Free-tier UX
  // without losing their admin bypass. Persisted to localStorage so it
  // survives reloads. Has no effect for non-owners (they can't be Pro via
  // bypass anyway).
  const [mockFreeMode, setMockFreeMode] = useState(false);

  useEffect(() => {
    storageGet("mock-free-mode").then(val => setMockFreeMode(val === "true"));
  }, [user?.id]);

  const toggleMockFreeMode = useCallback((next) => {
    setMockFreeMode(next);
    storageSet("mock-free-mode", String(next));
  }, []);

  // Refetches upload allowance from the server. Single source of truth —
  // server resets the monthly counter at the calendar boundary, so we don't
  // do month math on the client.
  const refetchUploadAllowance = useCallback(async () => {
    if (!user?.id) {
      setUploadsUsed(0);
      setUploadLimit(FREE_UPLOAD_LIMIT);
      setUploadsLoaded(true);
      return;
    }
    const { data, error } = await supabase.rpc("check_upload_allowed");
    if (error) {
      console.warn("check_upload_allowed failed:", error.message);
      setUploadsLoaded(true);
      return;
    }
    setUploadsUsed(data?.used ?? 0);
    setUploadLimit(data?.limit ?? FREE_UPLOAD_LIMIT);
    setMaxFileSize(data?.max_file_size_bytes ?? 26214400);
    setUploadsLoaded(true);
  }, [user?.id]);

  useEffect(() => { refetchUploadAllowance(); }, [refetchUploadAllowance]);

  // Fetch lockout once on user change. Doesn't need refetching during a
  // session — lockout state can only change via account deletion (which
  // signs the user out anyway).
  useEffect(() => {
    if (!user?.id) {
      setLockoutUntil(null);
      setLockoutLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("my_post_deletion_lockout_until");
      if (cancelled) return;
      if (error) {
        console.warn("my_post_deletion_lockout_until failed:", error.message);
        setLockoutLoaded(true);
        return;
      }
      setLockoutUntil(data ?? null);
      setLockoutLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Refetches the gifted Pro grant from profiles. Exposed so the AdminPanel
  // gift form can refresh the granter's own state if they grant themselves.
  const refetchProGrant = useCallback(async () => {
    if (!user?.id) {
      setProGrantUntil(null);
      setProGrantLoaded(true);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("pro_grant_until")
      .eq("id", user.id)
      .single();
    if (error) {
      console.warn("pro_grant_until fetch failed:", error.message);
      setProGrantLoaded(true);
      return;
    }
    setProGrantUntil(data?.pro_grant_until ?? null);
    setProGrantLoaded(true);
  }, [user?.id]);

  useEffect(() => { refetchProGrant(); }, [refetchProGrant]);

  useEffect(() => {
    if (!user?.id) {
      setSubRow(null);
      setSubLoaded(true);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) console.error("useSubscription fetch failed:", error);
      setSubRow(data ?? null);
      setSubLoaded(true);
    })();

    // Realtime: webhook writes propagate within ~1s without a refetch.
    const channel = supabase
      .channel(`sub-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") setSubRow(null);
          else setSubRow(payload.new);
          // Tier change → server limit changes too. Refresh the cache.
          refetchUploadAllowance();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const permissions = getRolePermissions(role);
  const adminBypass = permissions.canBypassPaywall;

  const status = subRow?.status;
  const isTrialing = status === "trialing";
  const isActiveOrPastDue = status === "active" || status === "past_due";
  const isProGrantActive = !!proGrantUntil &&
    new Date(proGrantUntil).getTime() > Date.now();

  // Owner can opt out of admin bypass for UI-testing the Free experience.
  // Doesn't affect non-owners — they couldn't use bypass anyway.
  const effectiveAdminBypass = adminBypass && !mockFreeMode;
  const isPro = effectiveAdminBypass || isTrialing || isActiveOrPastDue || isProGrantActive;
  const isTrial = isTrialing && !effectiveAdminBypass;
  const plan = effectiveAdminBypass
    ? "pro"
    : isTrialing
      ? "trial"
      : isActiveOrPastDue
        ? "pro"
        : isProGrantActive
          ? "pro"
          : "free";
  const billingCycle = subRow?.billing_cycle ?? null;
  const isPastDue = status === "past_due";
  const cancelAtPeriodEnd = subRow?.cancel_at_period_end ?? false;
  const currentPeriodEnd = subRow?.current_period_end ?? null;
  const hasStripeHistory = subRow != null;

  const trialDaysLeft = isTrialing && subRow?.trial_end
    ? Math.max(0, Math.ceil((new Date(subRow.trial_end).getTime() - Date.now()) / 86400000))
    : 0;

  // Post-deletion lockout: free-tier features suspended until the date passes
  // OR the user subscribes (Pro/Trial bypasses the lockout — they're paying).
  // adminBypass also bypasses (owner shouldn't be locked out by their own data).
  // effectiveAdminBypass respects the owner's mockFreeMode toggle.
  const isLockedOut = !!lockoutUntil && !isPro && !effectiveAdminBypass &&
    new Date(lockoutUntil).getTime() > Date.now();

  // Server-derived limit (uploadLimit) wins over the role-based override.
  // adminBypass short-circuits to Infinity for our owner account; if the
  // owner has toggled Free view, fall through to the real upload limit.
  // Lockout zeroes the limit so canUpload is false regardless of count.
  const effectiveLimit = effectiveAdminBypass ? Infinity : (isLockedOut ? 0 : uploadLimit);
  const canUpload = !isLockedOut && uploadsUsed < effectiveLimit;

  const loaded = subLoaded && uploadsLoaded && lockoutLoaded && proGrantLoaded;

  // Increments the server counter via RPC, then mirrors the change locally.
  // Callers should already have checked canUpload before invoking; this is
  // the post-success bookkeeping. Optimistic local bump if RPC succeeds.
  const recordUpload = useCallback(async () => {
    if (isPro) return;  // Pro is unlimited; nothing to track.
    const { error } = await supabase.rpc("record_upload");
    if (error) {
      console.warn("record_upload failed:", error.message);
      // Refetch to get the truth — local count would be stale.
      await refetchUploadAllowance();
      return;
    }
    setUploadsUsed(p => p + 1);
  }, [isPro, refetchUploadAllowance]);

  // Routes through the cancel-subscription edge function. Stripe handles the
  // immediate-vs-end-of-period decision based on current status; webhook then
  // updates the subscriptions row, realtime fires, UI updates.
  const cancelSubscription = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not signed in");
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-subscription`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Cancellation failed");
    }
    return await res.json();
  }, []);

  return {
    plan,
    isPro,
    isTrial,
    isPastDue,
    cancelAtPeriodEnd,
    currentPeriodEnd,
    trialDaysLeft,
    billingCycle,
    hasStripeHistory,
    uploadsUsed,
    uploadLimit,
    maxFileSize,
    canUpload,
    loaded,
    isLockedOut,
    lockoutUntil,
    isProGrantActive,
    proGrantUntil,
    refetchProGrant,
    recordUpload,
    refetchUploadAllowance,
    cancelSubscription,
    // Owner-only Free/Pro view toggle for UI testing.
    mockFreeMode,
    toggleMockFreeMode,
    // Alias retained because SubscriptionModal currently calls cancelTrial()
    // for both trial and Pro cancellations. Edge function branches internally.
    cancelTrial: cancelSubscription,
  };
}
