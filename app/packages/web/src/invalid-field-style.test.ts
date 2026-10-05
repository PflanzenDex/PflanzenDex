import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// US-ACC-02: a refused field gets a visible marker, but marking it must not move the layout (issue 297). The real
// height check runs in the browser (test log); here the rule itself is pinned: no border width, no padding, no margin.
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const rule = /\[aria-invalid="true"\]\s*{([^}]*)}/.exec(css)?.[1] ?? "";

describe("US-ACC-02 marker of a refused field", () => {
  it("US-ACC-02 draws the marker visibly (colour and inset ring) without changing the box size", () => {
    expect(rule).toContain("var(--destructive)");
    expect(rule).toMatch(/box-shadow:\s*inset/);
    expect(rule).not.toMatch(/(^|[\s;])border(-width)?:\s*\d+px/);
    expect(rule).not.toMatch(/padding|margin|outline-offset:\s*[1-9]/);
  });
});
