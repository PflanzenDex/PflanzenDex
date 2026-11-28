// US-QS-15 · NFR-13: the focus ring of a heading or the main region is dropped only under the owner-decided selector
// (owner decision 2026-10-30, #1034; DS-37 in docs/guides/reference/design-system.md). jsdom cannot compute :focus
// outlines from a stylesheet, so this test reads the rule text of tokens.css.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokensCss = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const flat = tokensCss.replace(/\s+/g, " ");

describe("US-QS-15 · NFR-13 focus ring of a navigated heading", () => {
  it("US-QS-15 tokens.css drops the outline under the owner-decided selector, when the last input was not the keyboard", () => {
    expect(flat).toContain(
      ':root:not([data-input="keyboard"]) :is(h1, main)[tabindex="-1"]:focus { outline: none; }',
    );
  });

  it("US-QS-15 tokens.css gives every focused control a system-coloured outline in forced colors, outside the layers (issue 2629)", () => {
    // Outside @layer the rule beats the utility `focus-visible:outline-none` of the Button and every other control.
    const rule = flat.match(
      /@media \(forced-colors: active\) \{ :focus-visible \{ outline: 2px solid Highlight; outline-offset: (-?\d+)px; \} \}/,
    );
    expect(rule).not.toBeNull();
    // Strip comments, then the braces before the rule balance out: it is not inside an @layer block.
    const before = (rule ? flat.slice(0, rule.index) : "").replace(/\/\*.*?\*\//g, "");
    expect(before.split("{").length).toBe(before.split("}").length);
  });

  it("US-QS-15 the forced-colors outline lies inside the element's own box, so a clipping list cannot cut it (issue 2647)", () => {
    // Rows and cards sit in lists with `overflow-hidden` or `overflow-y-auto`; an outline outside the box (a positive offset)
    // is cut there. A negative offset at least as large as the line width keeps the whole ring inside the box.
    const rule = flat.match(
      /@media \(forced-colors: active\) \{ :focus-visible \{ outline: (\d+)px solid Highlight; outline-offset: (-?\d+)px; \} \}/,
    );
    expect(rule).not.toBeNull();
    const width = Number(rule?.[1]);
    const offset = Number(rule?.[2]);
    expect(offset).toBeLessThan(0);
    expect(offset + width).toBeLessThanOrEqual(0);
  });
});

// US-QS-32 · SG-COLOR-06 (F-0090): the browser's default selection read at 2.0:1 on the dark card.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
const token = (block: string, name: string) => {
  const at = block.indexOf(`${name}: #`);
  return at < 0 ? "" : block.slice(at + name.length + 2, at + name.length + 9);
};

describe("US-QS-32 · SG-COLOR-06 text selection colour", () => {
  const rootBlock = /:root \{(.*?)color-scheme/s.exec(tokensCss)?.[1] ?? "";
  const darkBlock =
    /prefers-color-scheme: dark\) \{\s*:root \{(.*?)\n {2}\}/s.exec(tokensCss)?.[1] ?? "";

  it("US-QS-32 tokens.css sets ::selection from the primary tokens in the base layer, and not in forced colors", () => {
    expect(flat).toMatch(
      /@media not \(forced-colors: active\) \{ ::selection \{ background-color: var\(--primary\); color: var\(--primary-foreground\); \} \}/,
    );
  });

  it("US-QS-32 selected text reads at 4.5:1 or more in light and in dark", () => {
    for (const block of [rootBlock, darkBlock]) {
      const bg = token(block, "--primary");
      const fg = token(block, "--primary-foreground");
      expect(bg).not.toBe("");
      expect(contrast(bg, fg)).toBeGreaterThanOrEqual(4.5);
      // The highlight itself stands out from the page and from the accent tint of a row (1.4.11 level, 3:1).
      expect(contrast(bg, token(block, "--accent"))).toBeGreaterThanOrEqual(3);
    }
  });
});
