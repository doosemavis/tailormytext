import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Mail, Calendar, Shield, KeyRound, Check, BadgeCheck, Download, FileJson, FileSpreadsheet } from "lucide-react";
import { THEMES } from "../config/constants";
import { ROLES } from "../config/roles";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { supabase } from "../utils/supabase";
import { storageGet } from "../utils/storage";
import { marketingThemeVars } from "../utils/marketingTheme";
import { formatDate } from "../utils/formatDate";
import { useStoredTheme } from "../hooks/useStoredTheme";
import Footer from "../components/Footer";

const MIN_PASSWORD_LENGTH = 8;
const LINK_RESET = { color: "inherit", textDecoration: "none" };

// CSV cell-escape: wrap in quotes if value contains a separator/quote/newline,
// double any inner quotes per RFC 4180.
function csvCell(val) {
  if (val == null) return "";
  const str = typeof val === "object" ? JSON.stringify(val) : String(val);
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

// Compose a multi-section CSV from the export object. Each data type gets
// its own labeled section so the file stays readable as a single download
// (avoids needing a ZIP for a multi-table export).
function buildCsv(data) {
  const lines = [];
  const pushKv = (label, obj) => {
    if (!obj) return;
    lines.push(label, "field,value");
    Object.entries(obj).forEach(([k, v]) => lines.push(`${csvCell(k)},${csvCell(v)}`));
    lines.push("");
  };
  const pushTable = (label, rows) => {
    if (!rows || rows.length === 0) return;
    lines.push(label);
    const cols = Object.keys(rows[0]);
    lines.push(cols.join(","));
    rows.forEach(r => lines.push(cols.map(c => csvCell(r[c])).join(",")));
    lines.push("");
  };
  pushKv("ACCOUNT", data.account);
  pushKv("PROFILE", data.profile);
  pushKv("SUBSCRIPTION", data.subscription);
  pushTable("RECENT DOCS", data.recent_docs);
  return lines.join("\n");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Live match indicator — appears as soon as the user types in confirm.
// Red while passwords differ, green when they match.
function MatchBadge({ password, confirm }) {
  if (!confirm) return null;
  const matches = password === confirm && password.length > 0;
  const color = matches ? "#10B981" : "#E25C5C";
  const bg    = matches ? "#10B98118" : "#E25C5C18";
  const border = matches ? "#10B98144" : "#E25C5C44";
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 999,
      background: bg, color, border: `1px solid ${border}`,
      fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
      marginTop: -4, alignSelf: "flex-start",
    }}>
      <span aria-hidden="true">{matches ? "✓" : "✗"}</span>
      {matches ? "Passwords match" : "Passwords do not match"}
    </div>
  );
}

export default function Account() {
  const { user, role, isOwner } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const { themeKey, t } = useStoredTheme();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(null);  // 'json' | 'csv' | null

  // Not signed in → bounce to home (auth modal lives there).
  useEffect(() => {
    if (user === null) return;  // still loading
    if (!user) navigate("/", { replace: true });
  }, [user, navigate]);

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, color: t.fg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: t.fgSoft }}>Sign in to view your account.</p>
      </div>
    );
  }

  const provider = user.app_metadata?.provider ?? "email";
  const isGoogleAccount = provider === "google";
  const memberSince = user.created_at;
  const lastSignIn = user.last_sign_in_at;
  const roleLabel = ROLES[role]?.label ?? "User";

  const passwordValid =
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    newPassword === confirmPassword;

  // GDPR-style data export. Pulls everything we have for this user and
  // downloads it as one file. RLS scopes the SELECTs to the calling user
  // automatically; no extra auth check needed.
  const handleExport = async (format) => {
    setExporting(format);
    try {
      const [profileRes, subRes, docsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("recent_docs").select("*").eq("user_id", user.id).order("timestamp", { ascending: false }),
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        account: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at,
          email_confirmed_at: user.email_confirmed_at,
          provider: user.app_metadata?.provider ?? "email",
        },
        profile: profileRes.data,
        subscription: subRes.data,
        recent_docs: docsRes.data ?? [],
      };

      // Trim to seconds, swap T + colons for dashes so the filename works
      // on Windows / macOS / Linux without sanitization (colons get rewritten
      // by some browsers). Example: 2026-05-03-15-30-45
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      if (format === "json") {
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        downloadBlob(blob, `tailormytext-export-${stamp}.json`);
      } else {
        const blob = new Blob([buildCsv(exportData)], { type: "text/csv;charset=utf-8" });
        downloadBlob(blob, `tailormytext-export-${stamp}.csv`);
      }
      showToast(`Exported as ${format.toUpperCase()}`, "success");
    } catch (err) {
      showToast("Export failed: " + (err.message ?? "unknown error"), "error");
    } finally {
      setExporting(null);
    }
  };

  const handlePasswordChange = async () => {
    if (!passwordValid || busy) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    showToast("Password updated.", "success");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="tmt-marketing" style={{ ...marketingThemeVars(t), minHeight: "100vh", background: "var(--tmt-paper)", color: "var(--tmt-ink)", display: "flex", flexDirection: "column", fontFamily: "var(--tmt-sans)" }}>
      {/* Header — same chrome as legal pages */}
      <header style={{ borderBottom: `1px solid ${t.borderSoft}`, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link to="/" style={{ ...LINK_RESET, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: t.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen size={16} style={{ color: t.accent, transform: "translateY(1px)" }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--tmt-ink)" }}>TailorMyText</span>
        </Link>
        <Link to="/" className="rf-link-btn" style={{ ...LINK_RESET, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--tmt-ink-soft)", padding: "8px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: "var(--tmt-paper-card)" }}>
          <ArrowLeft size={13} /> Back to Reader
        </Link>
      </header>

      {/* Main */}
      <main style={{ flex: 1, padding: "60px 24px 80px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 560 }}>
          <span className="tmt-label" style={{ display: "block", marginBottom: 10 }}>Settings · Profile</span>
          <h1 className="tmt-display" style={{ fontSize: 44, fontWeight: 360, color: "var(--tmt-ink)", margin: "0 0 32px", letterSpacing: "-0.02em", lineHeight: 1.05 }}>Account</h1>

          {/* Account info */}
          <div style={{ padding: "22px 22px", borderRadius: 14, background: "var(--tmt-paper-card)", border: `1px solid ${t.borderSoft}`, marginBottom: 24, display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Mail size={14} style={{ color: t.icon, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--tmt-ink-muted)", textTransform: "uppercase", letterSpacing: "0.14em", fontFamily: "var(--tmt-mono)" }}>Email</div>
                <div style={{ fontSize: 13, color: t.fg, fontWeight: 600, marginTop: 3 }}>{user.email}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Shield size={14} style={{ color: t.icon, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--tmt-ink-muted)", textTransform: "uppercase", letterSpacing: "0.14em", fontFamily: "var(--tmt-mono)" }}>Sign-in method</div>
                <div style={{ fontSize: 13, color: t.fg, fontWeight: 600, marginTop: 3 }}>
                  {isGoogleAccount ? "Google" : "Email & password"}
                </div>
              </div>
            </div>
            {(isOwner || role !== "user") && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <BadgeCheck size={14} style={{ color: t.icon, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--tmt-ink-muted)", textTransform: "uppercase", letterSpacing: "0.14em", fontFamily: "var(--tmt-mono)" }}>TailorMyText role</div>
                  <div style={{ fontSize: 13, color: t.fg, fontWeight: 600, marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {isOwner && (
                      <>
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: "#10B98118", color: "#10B981", border: "1px solid #10B98144", fontSize: 10, fontWeight: 700 }}>OWNER</span>
                        <span>&</span>
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: "#10B98118", color: "#10B981", border: "1px solid #10B98144", fontSize: 10, fontWeight: 700 }}>ADMIN</span>
                      </>
                    )}
                    {role !== "user" && !isOwner && <span style={{ padding: "2px 8px", borderRadius: 999, background: t.accentSoft, color: t.accent, fontSize: 10, fontWeight: 700 }}>{roleLabel.toUpperCase()}</span>}
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Calendar size={14} style={{ color: t.icon, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--tmt-ink-muted)", textTransform: "uppercase", letterSpacing: "0.14em", fontFamily: "var(--tmt-mono)" }}>Member since</div>
                <div style={{ fontSize: 13, color: t.fg, fontWeight: 600, marginTop: 3 }}>{formatDate(memberSince)}</div>
                {lastSignIn && (
                  <span style={{
                    display: "inline-flex", alignItems: "center",
                    padding: "3px 9px", borderRadius: 999,
                    background: t.accentSoft, color: t.accent,
                    fontSize: 10, fontWeight: 650, fontFamily: "'DM Sans', sans-serif",
                    marginTop: 6,
                  }}>
                    Last sign-in: {formatDate(lastSignIn)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Change password */}
          <div style={{ padding: "22px 22px", borderRadius: 14, background: "var(--tmt-paper-card)", border: `1px solid ${t.borderSoft}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <KeyRound size={14} style={{ color: t.icon }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: t.fg }}>
                Change or Set Password
              </div>
            </div>
            {isGoogleAccount && (
              <p style={{ fontSize: 12, color: t.fgSoft, lineHeight: 1.55, margin: "0 0 12px" }}>
                You signed in with Google. Setting a password lets you also sign in with your email and password as a backup.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.fg, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.fg, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}
              />
              <MatchBadge password={newPassword} confirm={confirmPassword} />
              {newPassword && newPassword.length < MIN_PASSWORD_LENGTH && (
                <p style={{ fontSize: 11, color: t.fgSoft, margin: 0 }}>At least {MIN_PASSWORD_LENGTH} characters.</p>
              )}
              <button
                onClick={handlePasswordChange}
                disabled={!passwordValid || busy}
                className="rf-btn-solid"
                style={{
                  padding: "10px 16px", borderRadius: 10, border: "none",
                  background: passwordValid && !busy ? t.accent : t.border,
                  color: passwordValid && !busy ? "#fff" : t.fgSoft,
                  cursor: passwordValid && !busy ? "pointer" : "not-allowed",
                  fontSize: 13, fontWeight: 660, fontFamily: "'DM Sans', sans-serif",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                  opacity: busy ? 0.7 : 1, alignSelf: "flex-start",
                  marginTop: 4,
                }}
              >
                {busy ? "Saving…" : <><Check size={13} /> {isGoogleAccount ? "Set password" : "Update password"}</>}
              </button>
            </div>
          </div>

          {/* Export your data */}
          <div style={{ padding: "22px 22px", borderRadius: 14, background: "var(--tmt-paper-card)", border: `1px solid ${t.borderSoft}`, marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Download size={14} style={{ color: t.icon }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: t.fg }}>
                Export your data
              </div>
            </div>
            <p style={{ fontSize: 12, color: t.fgSoft, lineHeight: 1.55, margin: "0 0 14px" }}>
              Download a copy of everything we have on your account — profile, subscription, document library index. Your document file contents stay on Supabase Storage and aren't included; this is the metadata + account data we hold about you.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => handleExport("json")}
                disabled={exporting !== null}
                style={{
                  padding: "9px 14px", borderRadius: 8, border: `1px solid ${t.border}`,
                  background: t.bg, color: t.fg,
                  cursor: exporting ? "not-allowed" : "pointer",
                  fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                  display: "inline-flex", alignItems: "center", gap: 6,
                  opacity: exporting && exporting !== "json" ? 0.5 : 1,
                }}
              >
                <FileJson size={13} />
                {exporting === "json" ? "Preparing…" : "Export as JSON"}
              </button>
              <button
                onClick={() => handleExport("csv")}
                disabled={exporting !== null}
                style={{
                  padding: "9px 14px", borderRadius: 8, border: `1px solid ${t.border}`,
                  background: t.bg, color: t.fg,
                  cursor: exporting ? "not-allowed" : "pointer",
                  fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                  display: "inline-flex", alignItems: "center", gap: 6,
                  opacity: exporting && exporting !== "csv" ? 0.5 : 1,
                }}
              >
                <FileSpreadsheet size={13} />
                {exporting === "csv" ? "Preparing…" : "Export as CSV"}
              </button>
            </div>
          </div>
        </div>
      </main>

      <Footer t={t} />
    </div>
  );
}
