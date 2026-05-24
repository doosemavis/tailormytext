import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, BookOpen, RefreshCw, Users, Gift, BarChart3, Crown, Trash2,
  AlertCircle, ChevronDown, Check, Map, Clock,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { supabase } from "../utils/supabase";
import { useAuth } from "../contexts/AuthContext";
import { formatDateShort } from "../utils/formatDate";
import { useStoredTheme } from "../hooks/useStoredTheme";
import { ROLES } from "../config/roles";
import {
  THEMES,
  SUPABASE_STORAGE_LIMIT_BYTES, SUPABASE_STORAGE_PLAN_LABEL,
  SUPABASE_DB_LIMIT_BYTES, SUPABASE_DB_PLAN_LABEL,
} from "../config/constants";
import { storageGet } from "../utils/storage";
import { useToast } from "../components/Toast";
import BookLoader from "../components/BookLoader";
import Footer from "../components/Footer";
import { marketingThemeVars } from "../utils/marketingTheme";
import RoadmapTab from "./admin/RoadmapTab";

const LINK_RESET = { color: "inherit", textDecoration: "none" };
const ROLE_OPTIONS = Object.entries(ROLES).map(([value, { label }]) => ({ value, label }));

function StatCard({ label, value, sub, t }) {
  return (
    <div style={{ flex: 1, minWidth: 130, padding: "14px 16px", borderRadius: 12, background: t.surface, border: `1px solid ${t.borderSoft}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: t.fgSoft, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 720, color: t.fg, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatRelative(iso) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────
// Tab: Users (existing role management)
// ─────────────────────────────────────────────────────────────────────────
function UsersTab({ t }) {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(null);

  const fetchProfiles = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error } = await supabase.from("profiles").select("id, email, role, created_at").order("created_at", { ascending: true });
    setLoading(false);
    if (error) { setError("Failed to load users: " + error.message); return; }
    setProfiles(data ?? []);
  }, []);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const handleRoleChange = async (profileId, newRole) => {
    if (profileId === user.id) { setError("You cannot change your own role."); return; }
    setSaving(profileId);
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", profileId);
    setSaving(null);
    if (error) { setError("Failed to update role: " + error.message); return; }
    setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, role: newRole } : p));
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px 0" }}>
        <span style={{ fontSize: 12, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif" }}>{profiles.length} user{profiles.length === 1 ? "" : "s"}</span>
        <button onClick={fetchProfiles} aria-label="Refresh" style={{ background: "transparent", border: "none", cursor: "pointer", color: t.icon, padding: "4px 8px", borderRadius: 6 }}><RefreshCw size={14} /></button>
      </div>
      {error && <div style={{ margin: "12px 20px 0", padding: "10px 12px", borderRadius: 8, background: "#E25C5C18", border: "1px solid #E25C5C44", color: "#E25C5C", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{error}</div>}
      {loading ? (
        <div style={{ padding: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}><BookLoader size={120} t={t} /><span>Loading users…</span></div>
      ) : profiles.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>No users found.</div>
      ) : profiles.map((profile, i) => {
        const isSelf = profile.id === user.id;
        return (
          <div key={profile.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: i < profiles.length - 1 ? `1px solid ${t.borderSoft}` : "none" }}>
            <span style={{ width: 32, height: 32, borderRadius: 16, background: t.accentSoft, color: t.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>
              {profile.email?.[0]?.toUpperCase() ?? "?"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.fg, fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {profile.email} {isSelf && <span style={{ fontSize: 11, color: t.fgSoft }}>(you)</span>}
              </div>
              <div style={{ fontSize: 11, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>
                Joined {new Date(profile.created_at).toLocaleDateString()}
              </div>
            </div>
            <select
              value={profile.role}
              disabled={isSelf || saving === profile.id}
              onChange={e => handleRoleChange(profile.id, e.target.value)}
              style={{ padding: "5px 8px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface, color: isSelf ? t.fgSoft : t.fg, fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: isSelf ? "not-allowed" : "pointer", opacity: isSelf ? 0.5 : 1 }}
            >
              {ROLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tab: Grant Pro (gift Pro access by email — admin or owner)
// ─────────────────────────────────────────────────────────────────────────
function GrantProTab({ t }) {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [months, setMonths] = useState(3);
  const [busy, setBusy] = useState(false);
  const [grants, setGrants] = useState([]);
  const [pendingGrants, setPendingGrants] = useState([]);
  const [loadingGrants, setLoadingGrants] = useState(true);

  const fetchGrants = useCallback(async () => {
    setLoadingGrants(true);
    const [active, pending] = await Promise.all([
      supabase.rpc("list_active_pro_grants"),
      supabase.rpc("list_pending_pro_grants"),
    ]);
    setLoadingGrants(false);
    if (active.error) { showToast("Couldn't load active grants: " + active.error.message, "error"); }
    else setGrants(active.data ?? []);
    if (pending.error) { showToast("Couldn't load pending grants: " + pending.error.message, "error"); }
    else setPendingGrants(pending.data ?? []);
  }, [showToast]);

  useEffect(() => { fetchGrants(); }, [fetchGrants]);

  const handleGrant = async () => {
    if (!email.trim()) { showToast("Enter an email", "error"); return; }
    setBusy(true);
    const trimmedEmail = email.trim();
    const { data, error } = await supabase.rpc("grant_pro_access", { target_email: trimmedEmail, months });
    if (error) { setBusy(false); showToast("Grant failed: " + error.message, "error"); return; }

    const monthsLabel = `${months} month${months === 1 ? "" : "s"}`;
    const kind = data?.status === "queued" ? "queued" : "applied";

    // Fire-and-await the notification email. If it fails, the grant still
    // stands — surface a soft warning instead of rolling back.
    const { error: emailErr } = await supabase.functions.invoke("send-grant-email", {
      body: { to: trimmedEmail, kind, months },
    });
    setBusy(false);

    if (kind === "queued") {
      showToast(`Queued ${monthsLabel} for ${trimmedEmail} — will apply when they sign up.`, "success");
    } else {
      showToast(`Granted ${monthsLabel} Pro to ${trimmedEmail}`, "success");
    }
    if (emailErr) {
      showToast(`Grant succeeded but email failed to send: ${emailErr.message}`, "error");
    }
    setEmail("");
    fetchGrants();
  };

  const handleRevoke = async (targetEmail) => {
    setBusy(true);
    const { error } = await supabase.rpc("revoke_pro_access", { target_email: targetEmail });
    setBusy(false);
    if (error) { showToast("Revoke failed: " + error.message, "error"); return; }
    showToast(`Revoked Pro access for ${targetEmail}`, "info");
    fetchGrants();
  };

  const handleRevokePending = async (grantId, targetEmail) => {
    setBusy(true);
    const { data, error } = await supabase.rpc("revoke_pending_pro_grant", { grant_id: grantId });
    setBusy(false);
    if (error) { showToast("Cancel failed: " + error.message, "error"); return; }
    if (!data?.revoked) { showToast("Pending grant not found.", "error"); return; }
    showToast(`Cancelled pending grant for ${targetEmail}`, "info");
    fetchGrants();
  };

  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{ padding: "14px 16px", borderRadius: 12, background: t.surface, border: `1px solid ${t.borderSoft}`, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.fg, fontFamily: "'DM Sans', sans-serif", marginBottom: 8 }}>Grant Pro access</div>
        <p style={{ fontSize: 12, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", margin: "0 0 12px", lineHeight: 1.5 }}>
          If the email already has a TailorMyText account, the grant applies immediately. Otherwise it's queued and auto-applies the moment they sign up. Grants stack and don't require Stripe.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="user@email.com"
            disabled={busy}
            style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.fg, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}
          />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                disabled={busy}
                className="rf-static"
                style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.fg, fontSize: 13, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, minWidth: 88, outline: "none" }}
              >
                <span style={{ flex: 1, textAlign: "left" }}>{months} mo</span>
                <ChevronDown size={14} style={{ color: t.icon }} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.15)", padding: 4, minWidth: 100, zIndex: 1100, outline: "none" }}
              >
                {[1, 3, 6, 12].map(n => (
                  <DropdownMenu.Item
                    key={n}
                    onSelect={() => setMonths(n)}
                    onMouseEnter={e => e.currentTarget.style.background = t.surfaceHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    style={{ padding: "8px 10px", cursor: "pointer", color: t.fg, fontSize: 13, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 6, outline: "none", userSelect: "none" }}
                  >
                    {n} mo
                    {months === n && <Check size={13} style={{ color: t.accent }} />}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <button
            onClick={handleGrant}
            disabled={busy || !email.trim()}
            style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: t.accent, color: "#fff", fontSize: 13, fontWeight: 660, fontFamily: "'DM Sans', sans-serif", cursor: busy || !email.trim() ? "not-allowed" : "pointer", opacity: busy || !email.trim() ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}
          >
            <Gift size={13} /> Grant
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        Active grants {!loadingGrants && `(${grants.length})`}
      </div>
      {loadingGrants ? (
        <div style={{ padding: 20, color: t.fgSoft, fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Loading…</div>
      ) : grants.length === 0 ? (
        <div style={{ padding: 20, color: t.fgSoft, fontSize: 13, fontFamily: "'DM Sans', sans-serif", textAlign: "center", border: `1px dashed ${t.border}`, borderRadius: 10 }}>No active grants.</div>
      ) : grants.map(g => (
        <div key={g.email} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: t.surface, border: `1px solid ${t.borderSoft}`, marginBottom: 6 }}>
          <Crown size={14} style={{ color: t.accent, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.fg, fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.email}</div>
            <div style={{ fontSize: 11, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif" }}>Until {formatDateShort(g.pro_grant_until)}</div>
          </div>
          <button
            onClick={() => handleRevoke(g.email)}
            disabled={busy}
            aria-label={`Revoke grant for ${g.email}`}
            style={{ background: "transparent", border: "none", cursor: busy ? "not-allowed" : "pointer", color: "#E25C5C", padding: "4px 8px", borderRadius: 6, display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}
          >
            <Trash2 size={12} /> Revoke
          </button>
        </div>
      ))}

      <div style={{ fontSize: 12, fontWeight: 700, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", margin: "20px 0 8px" }}>
        Pending grants {!loadingGrants && `(${pendingGrants.length})`}
      </div>
      {loadingGrants ? null : pendingGrants.length === 0 ? (
        <div style={{ padding: 20, color: t.fgSoft, fontSize: 13, fontFamily: "'DM Sans', sans-serif", textAlign: "center", border: `1px dashed ${t.border}`, borderRadius: 10 }}>
          No pending grants — gifts to emails without an account will queue here.
        </div>
      ) : pendingGrants.map(p => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: t.surface, border: `1px solid ${t.borderSoft}`, marginBottom: 6 }}>
          <Clock size={14} style={{ color: t.fgSoft, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.fg, fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.email}</div>
            <div style={{ fontSize: 11, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif" }}>{p.months} month{p.months === 1 ? "" : "s"} · queued {formatDateShort(p.granted_at)}</div>
          </div>
          <button
            onClick={() => handleRevokePending(p.id, p.email)}
            disabled={busy}
            aria-label={`Cancel pending grant for ${p.email}`}
            style={{ background: "transparent", border: "none", cursor: busy ? "not-allowed" : "pointer", color: "#E25C5C", padding: "4px 8px", borderRadius: 6, display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}
          >
            <Trash2 size={12} /> Cancel
          </button>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tab: Analytics (owner only)
// ─────────────────────────────────────────────────────────────────────────
function CapacityWidget({ title, planLabel, usedBytes, limitBytes, t }) {
  const used = Math.max(0, usedBytes || 0);
  const limit = Math.max(1, limitBytes || 1);
  const pct = Math.min(100, (used / limit) * 100);
  const remaining = Math.max(0, limit - used);

  // Capacity tiers — drives bar color + bottom pill. Thresholds chosen so
  // "Medium" gives ~weeks of runway to plan an upgrade before "High" hits.
  const capacity = pct >= 85
    ? { label: "High",   color: "#E25C5C", hint: "Approaching cap — upgrade to avoid bottleneck." }
    : pct >= 60
    ? { label: "Medium", color: "#F5A524", hint: "Plan an upgrade soon." }
    : { label: "Low",    color: "#3FB667", hint: "Plenty of headroom." };

  return (
    <div style={{ padding: "14px 16px", borderRadius: 12, background: t.surface, border: `1px solid ${t.borderSoft}`, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.fgSoft, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Sans', sans-serif" }}>
          {title} · {planLabel}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: t.fg, fontFamily: "'DM Sans', sans-serif" }}>{pct.toFixed(1)}%</span>
      </div>

      <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`Storage used: ${pct.toFixed(1)}%`} style={{ height: 10, borderRadius: 999, background: t.borderSoft, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: capacity.color, transition: "width 200ms ease-out" }} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>
        <span><strong style={{ color: t.fg }}>{formatBytes(used)}</strong> used of {formatBytes(limit)}</span>
        <span>{formatBytes(remaining)} free</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 10, borderTop: `1px solid ${t.borderSoft}` }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: t.fgSoft, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Sans', sans-serif" }}>Capacity</span>
        <span
          aria-label={`Capacity: ${capacity.label}`}
          style={{
            padding: "3px 10px",
            borderRadius: 999,
            background: capacity.color,
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontFamily: "'DM Sans', sans-serif",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
        >
          {capacity.label}
        </span>
        <span style={{ fontSize: 12, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif" }}>
          {capacity.hint}
        </span>
      </div>
    </div>
  );
}

function PillRow({ label, entries, t, empty }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.fgSoft, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Sans', sans-serif", marginBottom: 8 }}>{label}</div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 13, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif" }}>{empty}</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {entries.map(([k, v]) => (
            <span key={k} style={{ padding: "4px 10px", borderRadius: 999, background: t.accentSoft, color: t.accent, fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
              {k}: {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Marketing funnel — six stages from anonymous landing to paid checkout,
// with stage-to-stage conversion. distinct-session counts come from the
// public.events table (see migration 20260506000000_marketing_events.sql).
function pct(num, denom) {
  if (!denom || denom <= 0) return null;
  return Math.round((num / denom) * 1000) / 10;
}

function FunnelSection({ funnel, t }) {
  const stages = [
    { key: "landing",            label: "Landing" },
    { key: "signup",             label: "Signup" },
    { key: "first_upload",       label: "First upload" },
    { key: "paywall_view",       label: "Paywall view" },
    { key: "checkout_started",   label: "Checkout started" },
    { key: "checkout_succeeded", label: "Paid" },
  ];
  const counts = stages.map(s => Number(funnel?.[s.key] ?? 0));
  const overall = pct(counts[5], counts[0]);
  return (
    <div style={{ padding: "14px 16px", borderRadius: 12, background: t.surface, border: `1px solid ${t.borderSoft}`, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.fgSoft, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Sans', sans-serif" }}>Funnel (30d)</div>
        <div style={{ fontSize: 11, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif" }}>
          Landing → Paid: <strong style={{ color: t.fg }}>{overall == null ? "—" : `${overall}%`}</strong>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {stages.map((s, i) => {
          const count = counts[i];
          const fromPrev = i === 0 ? null : pct(count, counts[i - 1]);
          const sub = i === 0 ? "entry" : (fromPrev == null ? "—" : `${fromPrev}% from prev`);
          return <StatCard key={s.key} label={s.label} value={count} sub={sub} t={t} />;
        })}
      </div>
    </div>
  );
}

function TrafficSourcesSection({ sources, t }) {
  const utmEntries = (sources?.utm_sources ?? []).map(r => [r.source, r.sessions]);
  const refEntries = (sources?.referrers   ?? []).map(r => [r.host,   r.sessions]);
  const direct = Number(sources?.direct ?? 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 16px", borderRadius: 12, background: t.surface, border: `1px solid ${t.borderSoft}`, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.fgSoft, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Sans', sans-serif" }}>Traffic sources (30d)</div>
        <div style={{ fontSize: 11, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif" }}>
          Direct / no referrer: <strong style={{ color: t.fg }}>{direct}</strong>
        </div>
      </div>
      <PillRow label="UTM (Urchin Tracking Module) sources"  entries={utmEntries} t={t} empty="No UTM-tagged landings yet — add ?utm_source=… to outbound links." />
      <PillRow label="Top referrers" entries={refEntries} t={t} empty="No external referrers recorded yet." />
    </div>
  );
}

function AnalyticsTab({ t }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [users, subs, mrr, conv, dels, docs, docTypes, storage, sweeps, cycles, db, funnel, sources] = await Promise.all([
        supabase.rpc("analytics_user_counts"),
        supabase.rpc("analytics_subscription_status"),
        supabase.rpc("analytics_mrr_cents"),
        supabase.rpc("analytics_trial_conversion_30d"),
        supabase.rpc("analytics_deletion_volume"),
        supabase.rpc("analytics_doc_counts"),
        supabase.rpc("analytics_doc_types"),
        supabase.rpc("analytics_storage_bytes"),
        supabase.rpc("analytics_ttl_sweeps"),
        supabase.rpc("analytics_subscription_billing_cycle"),
        supabase.rpc("analytics_database_bytes"),
        supabase.rpc("analytics_funnel_30d"),
        supabase.rpc("analytics_traffic_sources_30d"),
      ]);
      const firstErr = [users, subs, mrr, conv, dels, docs, docTypes, storage, sweeps, cycles, db, funnel, sources].find(r => r.error);
      if (firstErr) throw new Error(firstErr.error.message);
      setData({
        users: users.data,
        subs: subs.data ?? {},
        cycles: cycles.data ?? {},
        mrrCents: mrr.data ?? 0,
        conv: conv.data,
        dels: dels.data,
        docs: docs.data,
        docTypes: docTypes.data ?? {},
        storage: storage.data,
        sweeps: sweeps.data,
        db: db.data,
        funnel: funnel.data ?? {},
        sources: sources.data ?? {},
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <div style={{ padding: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}><BookLoader size={120} t={t} /><span>Loading analytics…</span></div>;
  if (err) return <div style={{ padding: 24, display: "flex", alignItems: "center", gap: 8, color: "#E25C5C", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}><AlertCircle size={16} /> {err}</div>;
  if (!data) return null;

  const mrrUsd = (data.mrrCents / 100).toFixed(2);
  const arrUsd = (data.mrrCents * 12 / 100).toFixed(2);
  const subEntries = Object.entries(data.subs);
  const payingSubs = (data.subs.active ?? 0) + (data.subs.past_due ?? 0);
  const trialingSubs = data.subs.trialing ?? 0;
  const cycleEntries = Object.entries(data.cycles);
  const docTypeEntries = Object.entries(data.docTypes).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: t.fgSoft, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Sans', sans-serif" }}>Owner-only</span>
        <button onClick={refresh} aria-label="Refresh" style={{ background: "transparent", border: "none", cursor: "pointer", color: t.icon, padding: "4px 8px", borderRadius: 6 }}><RefreshCw size={14} /></button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <StatCard label="Total users" value={data.users?.total ?? 0} sub={`+${data.users?.last_7d ?? 0} last 7d`} t={t} />
        <StatCard label="New users (30d)" value={data.users?.last_30d ?? 0} sub={`${data.users?.today ?? 0} today`} t={t} />
        <StatCard label="Monthly Recurring Revenue (MRR)" value={`$${mrrUsd}`} sub={`ARR ≈ $${arrUsd}`} t={t} />
        <StatCard label="Active paying subs" value={payingSubs} sub={`${trialingSubs} trialing`} t={t} />
        <StatCard label="Trial → paid" value={`${data.conv?.rate ?? 0}%`} sub={`${data.conv?.conversions ?? 0} of ${data.conv?.trials ?? 0} (30d)`} t={t} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <StatCard label="Docs stored" value={data.docs?.total ?? 0} sub={`${data.docs?.avg_per_user ?? 0} avg / user`} t={t} />
        <StatCard label="Docs uploaded (30d)" value={data.docs?.last_30d ?? 0} sub={`${data.docs?.last_7d ?? 0} last 7d`} t={t} />
        <StatCard label="Storage used" value={formatBytes(data.storage?.total_bytes)} sub={`${data.storage?.object_count ?? 0} objects`} t={t} />
        <StatCard label="TTL deleted (30d)" value={data.sweeps?.deleted_30d ?? 0} sub={`${data.sweeps?.deleted_7d ?? 0} last 7d`} t={t} />
        <StatCard label="Pending deletions" value={data.dels?.pending ?? 0} sub={`${data.dels?.completed_last_30d ?? 0} completed (30d)`} t={t} />
      </div>

      <CapacityWidget
        title="Storage plan"
        planLabel={SUPABASE_STORAGE_PLAN_LABEL}
        usedBytes={data.storage?.total_bytes ?? 0}
        limitBytes={SUPABASE_STORAGE_LIMIT_BYTES}
        t={t}
      />

      <CapacityWidget
        title="Database plan"
        planLabel={SUPABASE_DB_PLAN_LABEL}
        usedBytes={data.db?.total_bytes ?? 0}
        limitBytes={SUPABASE_DB_LIMIT_BYTES}
        t={t}
      />

      <FunnelSection funnel={data.funnel} t={t} />

      <TrafficSourcesSection sources={data.sources} t={t} />

      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 16px", borderRadius: 12, background: t.surface, border: `1px solid ${t.borderSoft}`, marginBottom: 12 }}>
        <PillRow label="Subscriptions by status" entries={subEntries} t={t} empty="No subscriptions yet." />
        <PillRow label="Subscriptions by billing cycle" entries={cycleEntries} t={t} empty="No paying subscribers yet." />
      </div>

      <div style={{ padding: "14px 16px", borderRadius: 12, background: t.surface, border: `1px solid ${t.borderSoft}`, marginBottom: 12 }}>
        <PillRow label="Documents by type" entries={docTypeEntries} t={t} empty="No documents stored yet." />
      </div>

      <div style={{ padding: "10px 14px", borderRadius: 10, background: `${t.accent}10`, border: `1px solid ${t.accent}33`, fontSize: 11, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
        <div>
          Signups today: <strong style={{ color: t.fg }}>{data.users?.today ?? 0}</strong> · Last 30d: <strong style={{ color: t.fg }}>{data.users?.last_30d ?? 0}</strong>
        </div>
        <div>
          TTL: last sweep <strong style={{ color: t.fg }}>{formatRelative(data.sweeps?.last_run_at)}</strong> · {data.sweeps?.runs_30d ?? 0} runs (30d) · {data.docs?.expiring_24h ?? 0} expiring in 24h
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Page shell — tab nav + auth gate, URL-driven via ?tab=
// ─────────────────────────────────────────────────────────────────────────
export default function AdminPanel() {
  const { user, role, isOwner, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { themeKey, t } = useStoredTheme();

  const isAdmin = role === "admin";
  const isAuthorized = !!user && (isAdmin || isOwner);

  // Auth gate: not signed in OR not admin/owner → home.
  useEffect(() => {
    if (authLoading) return;
    if (!user || !isAuthorized) navigate("/", { replace: true });
  }, [authLoading, user, isAuthorized, navigate]);

  const tabs = useMemo(() => [
    { id: "users",     label: "Users",     icon: Users,     visible: isAdmin },
    { id: "analytics", label: "Analytics", icon: BarChart3, visible: isOwner },
    { id: "roadmap",   label: "Roadmap",   icon: Map,       visible: isAdmin || isOwner },
    { id: "grants",    label: "Grant Pro", icon: Gift,      visible: isAdmin || isOwner },
  ].filter(tab => tab.visible), [isAdmin, isOwner]);

  // URL-driven active tab: ?tab=analytics. Lets the user deep-link
  // (Roadmap menu item, browser back button) without a separate route.
  const tabFromUrl = searchParams.get("tab");
  const activeTab = tabs.some(tab => tab.id === tabFromUrl)
    ? tabFromUrl
    : tabs[0]?.id ?? "users";

  const setActiveTab = (id) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("tab", id);
      return next;
    }, { replace: true });
  };

  if (authLoading || !user) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, color: t.fg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: t.fgSoft }}>Loading…</p>
      </div>
    );
  }
  if (!isAuthorized) return null;

  return (
    <div className="tmt-marketing" style={{ ...marketingThemeVars(t), minHeight: "100vh", background: "var(--tmt-paper)", color: "var(--tmt-ink)", display: "flex", flexDirection: "column", fontFamily: "var(--tmt-sans)" }}>
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

      <main style={{ flex: 1, padding: "48px 24px 80px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 1180 }}>
          <div style={{ marginBottom: 28 }}>
            <span className="tmt-label" style={{ display: "block", marginBottom: 10 }}>Internal · Admin tools</span>
            <h1 className="tmt-display" style={{ fontSize: 44, fontWeight: 360, color: "var(--tmt-ink)", margin: "0 0 10px", letterSpacing: "-0.02em", lineHeight: 1.05 }}>
              Admin panel
            </h1>
            <p style={{ fontFamily: "var(--tmt-serif-body)", fontSize: 16, fontStyle: "italic", color: "var(--tmt-ink-soft)", margin: 0, lineHeight: 1.55 }}>
              User management, owner analytics, and Pro grants &mdash; restricted to admin or owner roles.
            </p>
          </div>

          <div style={{ background: t.bg, border: `1px solid ${t.borderSoft}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
            {tabs.length > 1 && (
              <div role="tablist" style={{ display: "flex", gap: 4, padding: "10px 20px 0", borderBottom: `1px solid ${t.borderSoft}` }}>
                {tabs.map(({ id, label, icon: Icon }) => {
                  const active = activeTab === id;
                  return (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={active}
                      tabIndex={active ? 0 : -1}
                      onClick={() => setActiveTab(id)}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.color = t.fg; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.color = t.fgSoft; }}
                      className="rf-static"
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "9px 14px",
                        border: "none",
                        background: "transparent",
                        borderBottom: active ? `2px solid ${t.accent}` : "2px solid transparent",
                        color: active ? t.accent : t.fgSoft,
                        cursor: "pointer",
                        fontSize: 13, fontWeight: 600,
                        fontFamily: "'DM Sans', sans-serif",
                        marginBottom: -1,
                        outline: "none",
                        transition: "color 0.15s, border-color 0.15s",
                      }}
                    >
                      <Icon size={14} /> {label}
                    </button>
                  );
                })}
              </div>
            )}

            <div>
              {tabs.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>You don't have access to any admin tools.</div>
              ) : activeTab === "users" ? <UsersTab t={t} />
                : activeTab === "grants" ? <GrantProTab t={t} />
                : activeTab === "analytics" ? <AnalyticsTab t={t} />
                : activeTab === "roadmap" ? <RoadmapTab t={t} />
                : null}
            </div>
          </div>
        </div>
      </main>

      <Footer t={t} />
    </div>
  );
}
