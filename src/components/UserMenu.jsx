import { LogOut, Settings, ChevronDown, ChevronRight, User, UserCircle, ImageIcon, Palette, CreditCard, Trash2, Receipt, ExternalLink, Map, Gift } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ROLES } from "../config/roles";
import { PremadeAvatarSvg } from "./PremadeAvatarSvg";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Switch from "@radix-ui/react-switch";

const ROLE_COLORS = {
  admin:    { bg: "#3B82F618", text: "#3B82F6" },
  elevated: { bg: "#22C55E18", text: "#22C55E" },
  user:     { bg: "transparent", text: "inherit" },
};

// Gift badge — sits alongside the role badge under the user's email when
// they have an active Pro grant. Amber tones differentiate it from the
// blue admin badge. Background uses 12% alpha to match ROLE_COLORS shape.
const GIFT_BADGE = { bg: "#D9770618", text: "#D97706" };

function Avatar({ avatar, initial, accent, size = 28 }) {
  const br = Math.round(size * 0.28);
  if (avatar?.type === "upload" && avatar?.dataUrl) {
    return <img src={avatar.dataUrl} alt="avatar" style={{ width: size, height: size, borderRadius: br, objectFit: "cover", display: "block", flexShrink: 0 }} />;
  }
  if (avatar?.type === "premade" && avatar?.id) {
    return <PremadeAvatarSvg id={avatar.id} bg={avatar.bg} size={size} borderRadius={br} />;
  }
  return (
    <span style={{ width: size, height: size, borderRadius: br, background: accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.46), fontWeight: 700, fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>
      {initial}
    </span>
  );
}

export default function UserMenu({ t, onShowAuth, onShowAvatarSettings, onShowSubscription, onShowPaymentReceipts, showPaymentReceipts, onShowDeleteAccount, avatar, themePersistEnabled, onToggleThemePersist, mockFreeMode, onToggleMockFreeMode, isProGrantActive }) {
  const { user, role, isOwner, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <button
        onClick={onShowAuth}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.fgSoft, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
      >
        <User size={13} /> Sign in
      </button>
    );
  }

  const initial = user.email?.[0]?.toUpperCase() ?? "?";
  const roleColor = ROLE_COLORS[role] ?? ROLE_COLORS.user;
  const roleLabel = ROLES[role]?.label ?? "User";

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button className="rf-static" style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px 4px 4px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", cursor: "pointer", color: t.fg, outline: "none" }}>
          <Avatar avatar={avatar} initial={initial} accent={t.accent} size={28} />
          <ChevronDown size={12} style={{ color: t.icon, transition: "transform 0.2s" }} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14, boxShadow: "0 18px 44px rgba(0,0,0,0.22)", minWidth: 240, overflow: "hidden", zIndex: 999, outline: "none" }}
        >
          {/* Profile header — not interactive */}
          <div style={{ padding: "14px 14px", borderBottom: `1px solid ${t.borderSoft}`, display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar avatar={avatar} initial={initial} accent={t.accent} size={36} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 9.5, fontWeight: 600, color: t.fgSoft, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}>Signed in</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.fg, fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                {role !== "user" && (
                  <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 8, fontSize: 9.5, fontWeight: 700, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", letterSpacing: "0.1em", textTransform: "uppercase", background: roleColor.bg, color: roleColor.text }}>{roleLabel}</span>
                )}
                {isProGrantActive && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 8, fontSize: 9.5, fontWeight: 700, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", letterSpacing: "0.1em", textTransform: "uppercase", background: GIFT_BADGE.bg, color: GIFT_BADGE.text }}>
                    <Gift size={11} /> Gift
                  </span>
                )}
                {/* Owner-only Pro/Free view toggle for UI testing.
                    Pinned to the far right of the row via margin-left: auto so
                    it sits under the email's right edge regardless of role
                    badge presence/length.
                    Switch ON  = Pro view (admin bypass active)
                    Switch OFF = Free view (admin bypass overridden) */}
                {isOwner && onToggleMockFreeMode && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                    <span style={{ fontSize: 10, fontWeight: 650, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif" }}>
                      {mockFreeMode ? "Free view" : "Pro view"}
                    </span>
                    <Switch.Root
                      checked={!mockFreeMode}
                      onCheckedChange={(checked) => onToggleMockFreeMode(!checked)}
                      onClick={e => e.stopPropagation()}
                      className="rf-static"
                      aria-label="Toggle Pro/Free view"
                      style={{
                        width: 36, height: 20, borderRadius: 10, padding: 2, flexShrink: 0,
                        background: !mockFreeMode ? (t.switchOn ?? t.accent) : t.border,
                        border: "none", cursor: "pointer",
                        transition: "background 0.2s ease",
                        display: "flex", alignItems: "center", outline: "none",
                      }}
                    >
                      <Switch.Thumb style={{
                        display: "block", width: 16, height: 16, borderRadius: 8,
                        background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                        transition: "transform 0.2s cubic-bezier(0.4,0,0.2,1)",
                        transform: !mockFreeMode ? "translateX(16px)" : "translateX(0)",
                      }} />
                    </Switch.Root>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Settings submenu — consolidates Change avatar, Manage subscription,
              and (for admins) Admin panel into a single nested flyout. Each
              child still opens its own dedicated modal (SRP preserved). */}
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger
              onMouseEnter={e => e.currentTarget.style.background = t.surfaceHover}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              style={{ padding: "10px 14px", cursor: "pointer", color: t.fg, fontSize: 13, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", borderBottom: `1px solid ${t.borderSoft}`, outline: "none", userSelect: "none" }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Settings size={14} style={{ color: t.icon }} /> Settings
              </span>
              <ChevronRight size={14} style={{ color: t.icon }} />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                sideOffset={4}
                style={{ minWidth: 200, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12, padding: 4, boxShadow: "0 12px 32px rgba(0,0,0,0.15)", zIndex: 1100 }}
              >
                <DropdownMenu.Item
                  onSelect={() => navigate("/account")}
                  onMouseEnter={e => e.currentTarget.style.background = t.surfaceHover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  style={{ padding: "10px 12px", cursor: "pointer", color: t.fg, fontSize: 13, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8, borderRadius: 8, outline: "none", userSelect: "none" }}
                >
                  <UserCircle size={14} style={{ color: t.icon }} /> Account
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={onShowAvatarSettings}
                  onMouseEnter={e => e.currentTarget.style.background = t.surfaceHover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  style={{ padding: "10px 12px", cursor: "pointer", color: t.fg, fontSize: 13, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8, borderRadius: 8, outline: "none", userSelect: "none" }}
                >
                  <ImageIcon size={14} style={{ color: t.icon }} /> Change avatar
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={onShowSubscription}
                  onMouseEnter={e => e.currentTarget.style.background = t.surfaceHover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  style={{ padding: "10px 12px", cursor: "pointer", color: t.fg, fontSize: 13, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8, borderRadius: 8, outline: "none", userSelect: "none" }}
                >
                  <CreditCard size={14} style={{ color: t.icon }} /> Manage subscription
                </DropdownMenu.Item>
                {showPaymentReceipts && (
                  <DropdownMenu.Item
                    onSelect={onShowPaymentReceipts}
                    onMouseEnter={e => e.currentTarget.style.background = t.surfaceHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    style={{ padding: "10px 12px", cursor: "pointer", color: t.fg, fontSize: 13, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", borderRadius: 8, outline: "none", userSelect: "none" }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Receipt size={14} style={{ color: t.icon }} /> Payment receipts
                    </span>
                    <ExternalLink size={11} style={{ color: t.icon }} />
                  </DropdownMenu.Item>
                )}
                {(role === "admin" || isOwner) && (
                  <DropdownMenu.Item
                    onSelect={() => navigate("/admin")}
                    onMouseEnter={e => e.currentTarget.style.background = t.surfaceHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    style={{ padding: "10px 12px", cursor: "pointer", color: t.fg, fontSize: 13, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8, borderRadius: 8, outline: "none", userSelect: "none" }}
                  >
                    <User size={14} style={{ color: t.icon }} /> Admin Panel
                  </DropdownMenu.Item>
                )}
                {(role === "admin" || isOwner) && (
                  <DropdownMenu.Item
                    onSelect={() => navigate("/admin?tab=roadmap")}
                    onMouseEnter={e => e.currentTarget.style.background = t.surfaceHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    style={{ padding: "10px 12px", cursor: "pointer", color: t.fg, fontSize: 13, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8, borderRadius: 8, outline: "none", userSelect: "none" }}
                  >
                    <Map size={14} style={{ color: t.icon }} /> Roadmap
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Separator style={{ height: 1, background: t.borderSoft, margin: "4px 0" }} />
                <DropdownMenu.Item
                  onSelect={onShowDeleteAccount}
                  onMouseEnter={e => e.currentTarget.style.background = "#E25C5C18"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  style={{ padding: "10px 12px", cursor: "pointer", color: "#E25C5C", fontSize: 13, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8, borderRadius: 8, outline: "none", userSelect: "none" }}
                >
                  <Trash2 size={14} /> Delete account
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>

          <DropdownMenu.Item
            onSelect={(e) => { e.preventDefault(); onToggleThemePersist?.(); }}
            onMouseEnter={e => e.currentTarget.style.background = t.surfaceHover}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            style={{ padding: "10px 14px", cursor: "pointer", color: t.fg, fontSize: 13, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", borderBottom: `1px solid ${t.borderSoft}`, outline: "none", userSelect: "none" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Palette size={14} style={{ color: t.icon }} /> Remember theme
            </span>
            <Switch.Root
              checked={!!themePersistEnabled}
              onCheckedChange={() => onToggleThemePersist?.()}
              onClick={e => e.stopPropagation()}
              className="rf-static"
              style={{
                width: 36, height: 20, borderRadius: 10, padding: 2, flexShrink: 0,
                background: themePersistEnabled ? (t.switchOn ?? t.accent) : t.border, border: "none", cursor: "pointer",
                transition: "background 0.2s ease", display: "flex", alignItems: "center",
                outline: "none",
              }}
            >
              <Switch.Thumb style={{
                display: "block", width: 16, height: 16, borderRadius: 8,
                background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                transition: "transform 0.2s cubic-bezier(0.4,0,0.2,1)",
                transform: themePersistEnabled ? "translateX(16px)" : "translateX(0)",
              }} />
            </Switch.Root>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            onSelect={signOut}
            onMouseEnter={e => e.currentTarget.style.background = "#E25C5C10"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            style={{ padding: "10px 14px", cursor: "pointer", color: "#E25C5C", fontSize: 13, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8, outline: "none", userSelect: "none" }}
          >
            <LogOut size={14} /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
