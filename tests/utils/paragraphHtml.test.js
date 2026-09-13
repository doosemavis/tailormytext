import { describe, it, expect } from "vitest";
import { escapeHtml, wordHtml, paragraphHtml, lineToWords, groupListBlocks, HUE_SLOT_COUNT } from "../../src/utils/paragraphHtml";

describe("escapeHtml", () => {
  it("neutralises every markup-significant character", () => {
    expect(escapeHtml(`<b a="x" c='y'>&`)).toBe("&lt;b a=&quot;x&quot; c=&#39;y&#39;&gt;&amp;");
    expect(escapeHtml(123)).toBe("123");
  });
});

describe("wordHtml", () => {
  it("emits the NeuroDiv/pacer contract: span > strong + rest + trailing space", () => {
    expect(wordHtml("Hello", 0, 1, 0.4)).toBe('<span class="rf-word" data-word="Hello" data-hue="0"><strong>He</strong>llo </span>');
  });

  it("bolds at least one character and never more than the word", () => {
    expect(wordHtml("a", 0, 1, 0)).toContain("<strong>a</strong> ");
    expect(wordHtml("abc", 0, 1, 1)).toContain("<strong>abc</strong> ");
  });

  it("escapes untrusted text in both the attribute and the content", () => {
    const html = wordHtml('<script>"x"</script>', 0, 1, 0.5);
    expect(html).not.toContain("<script");
    expect(html).toContain('data-word="&lt;script&gt;&quot;x&quot;&lt;/script&gt;"');
    // 20 chars × 0.5 → the first 10 (`<script>"x`) go inside <strong>.
    expect(html).toContain("<strong>&lt;script&gt;&quot;x</strong>&quot;&lt;/script&gt; </span>");
  });

  it("spreads hue slots 0..4 across the line and adds emphasis classes", () => {
    const slots = [0, 1, 2, 3, 4, 5].map((i) => /data-hue="(\d)"/.exec(wordHtml("w", i, 6, 0.5))[1]);
    expect(slots).toEqual(["0", "0", "1", "2", "3", "4"]);
    expect(HUE_SLOT_COUNT).toBe(5);
    expect(wordHtml("w", 0, 1, 0.5, true, true)).toContain('class="rf-word rf-md-b rf-md-i"');
  });
});

describe("lineToWords / groupListBlocks", () => {
  it("carries bold and italic flags per word, including nested markers", () => {
    expect(lineToWords("plain **bold __both__** __it__")).toEqual([
      { text: "plain", bold: false, italic: false },
      { text: "bold", bold: true, italic: false },
      { text: "both", bold: true, italic: true },
      { text: "it", bold: false, italic: true },
    ]);
  });

  it("groups consecutive bullets and numbered items", () => {
    const blocks = groupListBlocks(["- a", "- b", "text", "3. c", "{r:1.2}4. d"]);
    expect(blocks.map((b) => b.kind)).toEqual(["ul", "line", "ol"]);
    expect(blocks[0].items.map((i) => i.text)).toEqual(["a", "b"]);
    expect(blocks[2].start).toBe(3);
    expect(blocks[2].items[1]).toEqual({ text: "d", ratio: 1.2 });
  });
});

describe("paragraphHtml", () => {
  it("renders plain lines as rf-line paragraphs and drops blank lines", () => {
    const html = paragraphHtml("One two\n\n  \nThree", 0.5);
    expect(html).toBe(
      '<p class="rf-line">' + wordHtml("One", 0, 2, 0.5) + wordHtml("two", 1, 2, 0.5) + "</p>"
      + '<p class="rf-line">' + wordHtml("Three", 0, 1, 0.5) + "</p>",
    );
  });

  it("renders inline headings and size ratios", () => {
    expect(paragraphHtml("## Title", 0.5)).toMatch(/^<h2 class="rf-h2"><span class="rf-word"/);
    expect(paragraphHtml("### Sub", 0.5)).toMatch(/^<h3 class="rf-h3">/);
    expect(paragraphHtml("{r:1.45}Big", 0.5)).toMatch(/^<p class="rf-line" style="font-size:calc\(var\(--rf-font-size, 18px\) \* 1\.45\)">/);
    expect(paragraphHtml("{r:0}Bad ratio", 0.5)).toMatch(/^<p class="rf-line">/);
  });

  it("renders lists with per-item ratios", () => {
    const html = paragraphHtml("- a\n{r:1.1}- b\n2. c", 0.5);
    expect(html).toMatch(/^<ul class="rf-ul"><li class="rf-li">.*<\/li><li class="rf-li" style="font-size:[^"]+">.*<\/li><\/ul><ol class="rf-ol" start="2"><li class="rf-li">/);
  });

  it("never lets document text become markup", () => {
    const html = paragraphHtml('## <img src=x onerror=alert(1)>\n- <svg/onload=alert(2)>', 0.5);
    expect(html).not.toMatch(/<img|<svg/);
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;svg/onload=alert(2)&gt;");
  });
});
