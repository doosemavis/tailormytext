import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { THEMES } from "../../src/config/constants";

vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, role: null, isOwner: false, signOut: vi.fn() }),
}));
vi.mock("../../src/utils/supabase", () => ({ supabase: {} }));

const { default: UserMenu } = await import("../../src/components/UserMenu");
const renderMenu = (props) => render(<MemoryRouter><UserMenu t={THEMES.warm} onShowAuth={vi.fn()} {...props} /></MemoryRouter>);

describe("UserMenu compact", () => {
  it("default signed-out button shows the Sign in text", () => {
    renderMenu();
    const btn = screen.getByRole("button", { name: "Sign in" });
    expect(btn.textContent).toContain("Sign in");
  });

  it("compact signed-out button is icon-only but still named Sign in", () => {
    renderMenu({ compact: true });
    const btn = screen.getByRole("button", { name: "Sign in" });
    expect(btn.textContent).not.toContain("Sign in");
  });
});
