import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { THEMES } from "../../src/config/constants";

vi.mock("../../src/utils/supabase", () => ({
  supabase: { auth: { getSession: () => new Promise(() => {}) }, from: () => ({}) },
}));
vi.mock("../../src/utils/track", () => ({ track: vi.fn() }));

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
});
