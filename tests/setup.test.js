import { describe, it, expect } from "vitest";

// Smoke test for the test environment itself. Confirms happy-dom is
// active and the Blob.arrayBuffer polyfill from tests/setup.js worked.
// If this fails, no other parser test will run correctly.
describe("test environment", () => {
  it("happy-dom provides DOMParser", () => {
    expect(typeof DOMParser).toBe("function");
  });

  it("Blob.arrayBuffer polyfill is in place", async () => {
    const blob = new Blob(["hello"]);
    expect(typeof blob.arrayBuffer).toBe("function");
    const buf = await blob.arrayBuffer();
    expect(buf.byteLength).toBe(5);
  });

  it("DOMParser can parse XML and HTML", () => {
    const xml = new DOMParser().parseFromString("<a>b</a>", "application/xml");
    expect(xml.querySelector("a")?.textContent).toBe("b");
    const html = new DOMParser().parseFromString("<p>c</p>", "text/html");
    expect(html.querySelector("p")?.textContent).toBe("c");
  });
});
