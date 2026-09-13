import { memo } from "react";
import { FileText, Crown, Clock, Infinity, Zap, X } from "lucide-react";
import { FREE_UPLOAD_LIMIT } from "../config/constants";

const UploadBadge = memo(function UploadBadge({ sub, onUpgrade, onCancel, t }) {
  const pct = Math.min((sub.uploadsUsed / FREE_UPLOAD_LIMIT) * 100, 100);
  const isLow = sub.uploadsUsed >= FREE_UPLOAD_LIMIT - 1 && !sub.isPro;
  const chargeDate = sub.isTrial && sub.trialDaysLeft > 0 ? new Date(Date.now() + sub.trialDaysLeft * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  const priceLabel = sub.billingCycle === "annual" ? "$45/yr" : "$5/mo";

  const MONO = "'IBM Plex Mono', ui-monospace, monospace";
  const SANS = "'DM Sans', sans-serif";
  return (
    <div style={{ margin: "0 14px 8px", padding: "12px 14px", borderRadius: 12, background: t.surface, border: `1px solid ${t.borderSoft}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: sub.isPro ? 0 : 8 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: t.fgSoft, fontFamily: MONO, letterSpacing: "0.14em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
          {sub.isPro ? <><Crown size={12} style={{ color: t.accent }} /> {sub.isTrial ? "Pro · Trial" : "Pro"}</> : <><FileText size={12} /> Free</>}
        </span>
        {sub.isPro ? (sub.isTrial
          ? <span style={{ fontSize: 10, color: t.accent, fontWeight: 600, fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 4 }}><Clock size={11} /> {sub.trialDaysLeft}d left</span>
          : <span style={{ fontSize: 10, color: t.accent, fontWeight: 600, fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 4 }}><Infinity size={12} /> Unlimited</span>
        ) : (
          <span style={{ fontSize: 11, color: isLow ? "#E25C5C" : t.fgSoft, fontWeight: 600, fontFamily: MONO, letterSpacing: "0.04em" }}>{sub.uploadsUsed}/{FREE_UPLOAD_LIMIT}</span>
        )}
      </div>
      {!sub.isPro && (<>
        <div style={{ height: 4, borderRadius: 2, background: t.border, overflow: "hidden", marginBottom: 10 }}>
          <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: isLow ? "#E25C5C" : t.accent, transition: "width 0.3s ease" }} />
        </div>
        <button onClick={onUpgrade} style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: "none", background: t.accentSoft, color: t.accent, cursor: "pointer", fontSize: 12, fontWeight: 620, fontFamily: SANS, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxSizing: "border-box" }}>
          <Zap size={12} /> Upgrade to Pro
        </button>
      </>)}
      {sub.isTrial && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 11, color: t.fgSoft, fontFamily: SANS, margin: "0 0 8px", lineHeight: 1.4, textAlign: "center" }}>{priceLabel} starts {chargeDate} · Cancel anytime</p>
          <button onClick={onCancel} style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: `1px solid ${t.border}`, background: "transparent", color: t.fgSoft, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: SANS, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, boxSizing: "border-box" }}>
            <X size={11} /> Cancel trial
          </button>
        </div>
      )}
      {sub.isPro && !sub.isTrial && sub.billingCycle && (
        <p style={{ fontSize: 11, color: t.fgSoft, fontFamily: SANS, margin: "6px 0 0", textAlign: "center" }}>{sub.billingCycle === "annual" ? "$45/year" : "$5/month"} · Renews automatically</p>
      )}
    </div>
  );
});

export default UploadBadge;
