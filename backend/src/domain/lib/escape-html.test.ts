import { describe, expect, it } from "vitest";

import { escapeHtml } from "./escape-html";

describe("escapeHtml", () => {
  it("escapes the characters HTML reads, the ampersand first", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&amp;</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;amp;&lt;/a&gt;",
    );
  });

  it("leaves other text, accents and CJK included, as it is", () => {
    expect(escapeHtml("Zoë 你好")).toBe("Zoë 你好");
  });
});
