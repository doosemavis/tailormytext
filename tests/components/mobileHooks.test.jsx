import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { THEMES } from "../../src/config/constants";

vi.mock("../../src/utils/supabase", () => ({
  supabase: { auth: { getSession: () => new Promise(() => {}) }, from: () => ({}) },
}));
vi.mock("../../src/utils/track", () => ({ track: vi.fn() }));
vi.mock("../../src/components/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "test@example.com" }, signOut: vi.fn() }),
}));

const t = THEMES.warm;
const dialog = () => document.querySelector('[role="dialog"]');

describe("phone className hooks on dialogs", () => {
  it("PaywallModal", async () => {
    const { default: PaywallModal } = await import("../../src/components/PaywallModal");
    render(<PaywallModal uploadsUsed={3} onUpgrade={vi.fn()} onClose={vi.fn()} t={t} />);
    expect(dialog().className).toContain("tmt-m-dialog");
  });

  it("CheckoutModal", async () => {
    const { default: CheckoutModal } = await import("../../src/components/CheckoutModal");
    render(<CheckoutModal billing="monthly" onClose={vi.fn()} t={t} />);
    expect(dialog().className).toContain("tmt-m-dialog");
  });

  it("EditChaptersModal is full-screen on phone", async () => {
    const { default: EditChaptersModal } = await import("../../src/components/EditChaptersModal");
    render(
      <EditChaptersModal open onClose={vi.fn()} t={t} userId="u" docId="d"
        docSections={[{ type: "chapter", title: "One", number: 1, content: "Para one.\n\nPara two." }]}
        initialBreaks={null} initialTitles={null} onSaved={vi.fn()} />
    );
    expect(dialog().className).toContain("tmt-m-dialog-full");
  });

  it("SubscriptionModal", async () => {
    const { default: SubscriptionModal } = await import("../../src/components/SubscriptionModal");
    const sub = { isPro: false, isTrial: false, billingCycle: "monthly" };
    render(<SubscriptionModal open onOpenChange={vi.fn()} sub={sub} onShowPricing={vi.fn()} t={t} />);
    expect(dialog().className).toContain("tmt-m-dialog");
  });

  it("AvatarSettingsModal", async () => {
    const { default: AvatarSettingsModal } = await import("../../src/components/AvatarSettingsModal");
    render(
      <AvatarSettingsModal open onOpenChange={vi.fn()} onSave={vi.fn()} currentAvatar={null}
        isPro={false} onShowPricing={vi.fn()} t={t} />
    );
    expect(dialog().className).toContain("tmt-m-dialog");
  });

  it("DeleteAccountModal", async () => {
    const { default: DeleteAccountModal } = await import("../../src/components/DeleteAccountModal");
    const sub = { isPro: false, isTrial: false, billingCycle: "monthly" };
    render(<DeleteAccountModal open onOpenChange={vi.fn()} sub={sub} t={t} />);
    expect(dialog().className).toContain("tmt-m-dialog");
  });
});
