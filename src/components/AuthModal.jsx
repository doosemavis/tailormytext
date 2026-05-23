import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import * as Dialog from "@radix-ui/react-dialog";
import { marketingThemeVars } from "../utils/marketingTheme";
import { ModalCloseButton } from "./Primitives";

// Editorial overlay — dark warm tint instead of pure black, plus the paper
// grain peeks through the blur. Matches the marketing aesthetic.
const OVERLAY = {
  position: "fixed", inset: 0,
  background: "rgba(31, 24, 18, 0.55)",
  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
  zIndex: 1000,
};

const INPUT_STYLE = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 10,
  border: "1px solid var(--tmt-rule)",
  background: "var(--tmt-paper)",
  color: "var(--tmt-ink)",
  fontSize: 15,
  fontFamily: "var(--tmt-serif-body)",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
};

const LABEL_LINK = {
  color: "var(--tmt-ink-soft)",
  cursor: "pointer",
  textDecoration: "none",
  fontFamily: "var(--tmt-serif-body)",
  fontStyle: "italic",
  fontSize: 14,
  borderBottom: "1px solid var(--tmt-rule)",
  paddingBottom: 1,
  transition: "color 0.2s ease, border-color 0.2s ease",
};

// Lenient password rules per project decision (NIST 2024 style).
// Min length is the only hard gate; the strength meter is visual
// encouragement to choose longer passwords without forcing complexity.
const MIN_PASSWORD_LENGTH = 8;

// Heuristic strength score 0–100. Length dominates; character-class
// diversity adds modest bonuses. Doesn't block submission — the gate
// is just MIN_PASSWORD_LENGTH.
function passwordStrength(pw) {
  if (!pw) return 0;
  const len = pw.length;
  let score = Math.min(100, Math.max(0, (len - 4) * 6));
  if (len >= MIN_PASSWORD_LENGTH) {
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 8;
    if (/\d/.test(pw)) score += 8;
    if (/[^A-Za-z0-9]/.test(pw)) score += 8;
  }
  return Math.min(100, score);
}

function strengthLabel(score) {
  if (score < 25) return { label: "Weak",   color: "#B0512E" };
  if (score < 55) return { label: "Fair",   color: "#D9B07F" };
  if (score < 80) return { label: "Good",   color: "#4F7156" };
  return            { label: "Strong", color: "#3A5C42" };
}

function StrengthMeter({ password, id }) {
  if (!password) return null;
  const score = passwordStrength(password);
  const { label, color } = strengthLabel(score);
  const tooShort = password.length < MIN_PASSWORD_LENGTH;
  return (
    <div id={id} role="status" aria-live="polite" style={{ marginTop: -4 }}>
      <div style={{ height: 4, borderRadius: 2, background: "var(--tmt-rule)", overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: tooShort ? "var(--tmt-ink-muted)" : color, transition: "width 0.2s ease, background 0.2s ease" }} />
      </div>
      <div style={{ fontSize: 11, color: tooShort ? "var(--tmt-ink-muted)" : color, fontFamily: "var(--tmt-mono)", textTransform: "uppercase", letterSpacing: "0.14em", marginTop: 6 }}>
        {tooShort
          ? `${MIN_PASSWORD_LENGTH - password.length} more character${MIN_PASSWORD_LENGTH - password.length === 1 ? "" : "s"} to meet minimum`
          : label}
      </div>
    </div>
  );
}

function MatchBadge({ password, confirm, id }) {
  // Live match indicator — terra while passwords differ, sage when they
  // line up. Hidden until the user has typed in confirm so we don't nag
  // before they've had a chance.
  if (!confirm) return null;
  const matches = password === confirm && password.length > 0;
  const color  = matches ? "#3A5C42" : "#B0512E";
  const bg     = matches ? "#3A5C4218" : "#B0512E18";
  const border = matches ? "#3A5C4244" : "#B0512E44";
  return (
    <div id={id} role="status" aria-live="polite" style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 999,
      background: bg, color, border: `1px solid ${border}`,
      fontFamily: "var(--tmt-mono)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.14em",
      marginTop: -4, alignSelf: "flex-start",
    }}>
      <span aria-hidden="true">{matches ? "✓" : "✗"}</span>
      {matches ? "Passwords match" : "Passwords do not match"}
    </div>
  );
}

const OAUTH_PROVIDERS = [
  {
    id: "google", label: "Continue with Google",
    bg: "#fff", color: "#3c4043", border: "#dadce0",
    icon: (
      <svg width="18" height="18" viewBox="0 0 48 48">
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v8.51h12.84c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.19-10.36 7.19-17.14z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.5-1.45-.78-2.99-.78-4.59s.27-3.14.78-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.97 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      </svg>
    ),
  },
];

// `t` (active theme tokens) is spread as CSS custom properties on the
// Dialog.Content via marketingThemeVars so the modal re-skins itself to
// the active theme while keeping editorial typography (Fraunces/Newsreader/
// Plex Mono) constant.
export default function AuthModal({ onClose, t, initialView = "login" }) {
  const { signIn, signUp, resetPassword, signInWithOAuth, updatePassword, signOut, clearRecovery } = useAuth();
  const [view, setView] = useState(initialView);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(null);

  const clear = () => { setError(""); setInfo(""); };

  const handleLogin = async (e) => {
    e.preventDefault(); clear(); setBusy(true);
    try {
      const { error } = await signIn(email, password);
      if (error) setError(error.message === "Invalid login credentials" ? "Invalid email or password." : error.message);
      else onClose();
    } catch { setError("Something went wrong. Please try again."); }
    finally { setBusy(false); }
  };

  const handleSignUp = async (e) => {
    e.preventDefault(); clear();
    if (password.length < MIN_PASSWORD_LENGTH) { setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const { error } = await signUp(email, password);
      if (error) {
        if (error.status === 422 || error.message?.toLowerCase().includes("already registered") || error.message?.toLowerCase().includes("user already registered"))
          setError("An account with this email already exists. Try signing in instead.");
        else setError(error.message);
      } else onClose();
    } catch { setError("Something went wrong. Please try again."); }
    finally { setBusy(false); }
  };

  const handleReset = async (e) => {
    e.preventDefault(); clear(); setBusy(true);
    try {
      const { error } = await resetPassword(email);
      if (error) setError(error.message);
      else setInfo("Password reset link sent — check your email.");
    } catch { setError("Something went wrong. Please try again."); }
    finally { setBusy(false); }
  };

  // Recovery flow: user landed on the app via the email reset link, the SDK
  // established a recovery session, and we're forcing them to choose a new
  // password before letting them continue.
  const handleSetPassword = async (e) => {
    e.preventDefault(); clear();
    if (password.length < MIN_PASSWORD_LENGTH) { setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const { error } = await updatePassword(password);
      if (error) setError(error.message);
      else { clearRecovery?.(); onClose(); }
    } catch { setError("Something went wrong. Please try again."); }
    finally { setBusy(false); }
  };

  const handleOAuth = async (provider) => {
    clear(); setOauthBusy(provider);
    const { error } = await signInWithOAuth(provider);
    setOauthBusy(null);
    if (error) setError(error.message);
  };

  const title = view === "login" ? "Welcome back"
    : view === "signup" ? "Create your account"
    : view === "setPassword" ? "Set a new password"
    : "Reset password";

  const eyebrow = view === "login" ? "Sign in"
    : view === "signup" ? "Get started"
    : view === "setPassword" ? "Account recovery"
    : "Password reset";

  // In recovery mode, hide the close button and offer "Sign out" instead.
  // Closing the modal mid-recovery would leave the user signed in via the
  // recovery token without ever having reset their password — confusing.
  const isRecoveryMode = view === "setPassword";

  const pwToggleStyle = {
    position: "absolute", right: 12, top: 0, bottom: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "none", border: "none", cursor: "pointer",
    color: "var(--tmt-ink-muted)", padding: "0 4px",
  };

  return (
    <Dialog.Root open onOpenChange={o => { if (!o && !isRecoveryMode) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay style={OVERLAY} />
        <Dialog.Content
          onPointerDownOutside={(e) => { if (isRecoveryMode) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (isRecoveryMode) e.preventDefault(); }}
          className="tmt-marketing"
          style={{
            ...marketingThemeVars(t),
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            background: "var(--tmt-paper-card)",
            border: "1px solid var(--tmt-rule)",
            borderRadius: 24,
            width: "calc(100% - 48px)", maxWidth: 420,
            padding: "36px 36px 32px",
            // Cap height so the modal always fits the viewport with 24px
            // breathing room top + bottom; scroll inside when signup +
            // strength meter + match badge make the form taller than the
            // viewport on short windows.
            maxHeight: "calc(100vh - 48px)",
            overflowY: "auto",
            boxShadow: "0 28px 80px -20px rgba(31, 24, 18, 0.45), 0 6px 16px -8px rgba(31, 24, 18, 0.2)",
            zIndex: 1001,
          }}
        >
          {/* Title block — eyebrow + Fraunces display */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
            <div>
              <div style={{ marginBottom: 8 }}>
                <span className="tmt-eyebrow lead">{eyebrow}</span>
              </div>
              <Dialog.Title className="tmt-display" style={{ fontSize: 28, fontWeight: 380, letterSpacing: "-0.02em", margin: 0 }}>
                {title}
              </Dialog.Title>
            </div>
            {!isRecoveryMode && (
              <Dialog.Close asChild>
                <ModalCloseButton color="var(--tmt-ink-muted)" />
              </Dialog.Close>
            )}
          </div>

          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#B0512E18", border: "1px solid #B0512E44", color: "#8A3E22", fontFamily: "var(--tmt-serif-body)", fontSize: 14, marginBottom: 16 }}>{error}</div>
          )}
          {info && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#4F715618", border: "1px solid #4F715644", color: "#3A5C42", fontFamily: "var(--tmt-serif-body)", fontSize: 14, marginBottom: 16 }}>{info}</div>
          )}

          {view !== "reset" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                {OAUTH_PROVIDERS.map(({ id, label, icon }) => (
                  <button
                    key={id}
                    type="button"
                    disabled={oauthBusy !== null}
                    onClick={() => handleOAuth(id)}
                    className="tmt-btn ghost"
                    style={{
                      // Matches the editorial pill shape (12px radius, paper bg,
                      // raised game-button feel from the global button rule)
                      // used by every other CTA in the marketing modals. Google's
                      // brand G icon stays full-color so the provider is still
                      // immediately recognizable — only the button container
                      // adopts the theme paper aesthetic.
                      width: "100%",
                      justifyContent: "center",
                      opacity: oauthBusy && oauthBusy !== id ? 0.5 : 1,
                      transition: "opacity 0.15s, background 0.2s, border-color 0.2s",
                    }}
                  >
                    {icon}{oauthBusy === id ? "Redirecting…" : label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
                <div style={{ flex: 1, height: 1, background: "var(--tmt-rule)" }} />
                <span style={{ fontFamily: "var(--tmt-mono)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--tmt-ink-muted)" }}>or with email</span>
                <div style={{ flex: 1, height: 1, background: "var(--tmt-rule)" }} />
              </div>
            </>
          )}

          {view === "login" && (
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input type="email" placeholder="Email" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)} required style={INPUT_STYLE} />
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} placeholder="Password" aria-label="Password" value={password} onChange={e => setPassword(e.target.value)} required style={{ ...INPUT_STYLE, paddingRight: 44 }} />
                <button type="button" onClick={() => setShowPw(v => !v)} aria-label="Toggle password visibility" className="rf-static" style={pwToggleStyle}>{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              </div>
              <button type="submit" disabled={busy} className="rf-btn-solid tmt-btn" style={{ width: "100%", justifyContent: "center", marginTop: 6 }}>{busy ? "Signing in…" : "Sign in"}</button>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <a href="#" className="rf-link" onClick={(e) => { e.preventDefault(); setView("reset"); clear(); }} style={LABEL_LINK}>Forgot password?</a>
                <a href="#" className="rf-link" onClick={(e) => { e.preventDefault(); setView("signup"); clear(); }} style={LABEL_LINK}>Create account</a>
              </div>
            </form>
          )}

          {view === "signup" && (
            <form onSubmit={handleSignUp} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input type="email" placeholder="Email" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)} required style={INPUT_STYLE} />
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} placeholder="Password" aria-label="Password" aria-describedby="auth-password-strength" value={password} onChange={e => setPassword(e.target.value)} required minLength={MIN_PASSWORD_LENGTH} style={{ ...INPUT_STYLE, paddingRight: 44 }} />
                <button type="button" onClick={() => setShowPw(v => !v)} aria-label="Toggle password visibility" className="rf-static" style={pwToggleStyle}>{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              </div>
              <StrengthMeter password={password} id="auth-password-strength" />
              <input type={showPw ? "text" : "password"} placeholder="Confirm password" aria-label="Confirm password" aria-describedby="auth-password-match" value={confirm} onChange={e => setConfirm(e.target.value)} required style={INPUT_STYLE} />
              <MatchBadge password={password} confirm={confirm} id="auth-password-match" />
              <button type="submit" disabled={busy} className="rf-btn-solid tmt-btn" style={{ width: "100%", justifyContent: "center", marginTop: 6 }}>{busy ? "Creating account…" : "Create account"}</button>
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <a href="#" className="rf-link" onClick={(e) => { e.preventDefault(); setView("login"); clear(); }} style={LABEL_LINK}>Already have an account? Sign in</a>
              </div>
            </form>
          )}

          {view === "reset" && (
            <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input type="email" placeholder="Email" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)} required style={INPUT_STYLE} />
              <button type="submit" disabled={busy} className="rf-btn-solid tmt-btn" style={{ width: "100%", justifyContent: "center", marginTop: 6 }}>{busy ? "Sending…" : "Send reset link"}</button>
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <a href="#" className="rf-link" onClick={(e) => { e.preventDefault(); setView("login"); clear(); }} style={LABEL_LINK}>Back to sign in</a>
              </div>
            </form>
          )}

          {view === "setPassword" && (
            <form onSubmit={handleSetPassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontFamily: "var(--tmt-serif-body)", fontSize: 14.5, color: "var(--tmt-ink-soft)", margin: "0 0 6px", lineHeight: 1.55 }}>
                Choose a new password for your account. You'll be signed in automatically.
              </p>
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} placeholder="New password" aria-label="New password" aria-describedby="auth-password-strength" value={password} onChange={e => setPassword(e.target.value)} required minLength={MIN_PASSWORD_LENGTH} autoFocus style={{ ...INPUT_STYLE, paddingRight: 44 }} />
                <button type="button" onClick={() => setShowPw(v => !v)} aria-label="Toggle password visibility" className="rf-static" style={pwToggleStyle}>{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              </div>
              <StrengthMeter password={password} id="auth-password-strength" />
              <input type={showPw ? "text" : "password"} placeholder="Confirm new password" aria-label="Confirm new password" aria-describedby="auth-password-match" value={confirm} onChange={e => setConfirm(e.target.value)} required style={INPUT_STYLE} />
              <MatchBadge password={password} confirm={confirm} id="auth-password-match" />
              <button type="submit" disabled={busy} className="rf-btn-solid tmt-btn" style={{ width: "100%", justifyContent: "center", marginTop: 6 }}>{busy ? "Updating…" : "Set new password"}</button>
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <a href="#" className="rf-link" onClick={(e) => { e.preventDefault(); clearRecovery?.(); signOut(); onClose(); }} style={{ ...LABEL_LINK, color: "var(--tmt-ink-muted)", fontSize: 12 }}>
                  Cancel and sign out
                </a>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
