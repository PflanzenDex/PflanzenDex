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
      /@media \(forced-colors: active\) \{ :focus-visible \{ outline: 2px solid Highlight; outline-offset: 2px; \} \}/,
    );
    expect(rule).not.toBeNull();
    // Strip comments, then the braces before the rule balance out: it is not inside an @layer block.
    const before = (rule ? flat.slice(0, rule.index) : "").replace(/\/\*.*?\*\//g, "");
    expect(before.split("{").length).toBe(before.split("}").length);
  });
});
