import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PhoneReaderToolbar } from "../../../src/components/mobile";
import { THEMES } from "../../../src/config/constants";

describe("PhoneReaderToolbar", () => {
  it("renders slots in order: panel, chapter, badge, tools, account", () => {
    const { container } = render(
      <PhoneReaderToolbar
        panelButton={<button>panel</button>}
        chapterMenu={<button>chapter</button>}
        uncertaintyBadge={<span>badge</span>}
        tools={<button>tools</button>}
        userMenu={<button>account</button>}
        t={THEMES.warm}
      />
    );
    const text = [...container.querySelectorAll("button, span")].map((el) => el.textContent);
    expect(text).toEqual(["panel", "chapter", "badge", "tools", "account"]);
    expect(container.firstElementChild.className).toContain("rf-reader-chrome");
  });

  it("tolerates a missing chapter menu (single-section docs)", () => {
    const { container } = render(
      <PhoneReaderToolbar panelButton={<button>panel</button>} chapterMenu={false} uncertaintyBadge={null} tools={<button>tools</button>} userMenu={<button>account</button>} t={THEMES.warm} />
    );
    expect(container.textContent).toBe("paneltoolsaccount");
  });
});
