import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";

const tokens = readFileSync(new URL("./styles/tokens.css", import.meta.url), "utf8");

/** The body of the top-level block that starts with `head`, or null when it is missing or nested in another block. */
function topLevelBlock(css: string, head: string): string | null {
  const start = css.indexOf(head);
  if (start < 0) return null;
  const before = css.slice(0, start).replace(/\/\*[\s\S]*?\*\//g, "");
  const depth = (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length;
  if (depth !== 0) return null;
  const open = css.indexOf("{", start);
  let level = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") level += 1;
    if (css[i] === "}" && --level === 0) return css.slice(open + 1, i);
  }
  return null;
}

// The browser behavior is checked end to end in packages/e2e/tests/accessibility; these guard the rules themselves.
describe("US-QS-12 adaptable display: global rules in tokens.css", () => {
  it("US-QS-12 reduced motion ends animations and transitions at once, outside the layers (2.3.3, DS-19)", () => {
    const block = topLevelBlock(tokens, "@media (prefers-reduced-motion: reduce)");
    expect(block).not.toBeNull();
    expect(block).toMatch(/animation-duration:\s*1ms !important/);
    expect(block).toMatch(/transition-duration:\s*1ms !important/);
    expect(block).toMatch(/animation-iteration-count:\s*1 !important/);
  });

  it("US-QS-12 in forced colors every focused element gets a system-coloured outline, outside the layers (2.4.7, DS-37)", () => {
    const block = topLevelBlock(tokens, "@media (forced-colors: active)");
    expect(block).not.toBeNull();
    expect(block).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid Highlight/);
  });

  it("US-QS-12 a button keeps a border in forced colors, where its fill is replaced (1.4.11)", () => {
    for (const variant of ["default", "secondary", "ghost", "link", "destructive"] as const)
      expect(buttonVariants({ variant })).toContain("forced-colors:border");
  });

  it("US-QS-12 the block finder rejects a rule nested in a layer", () => {
    expect(topLevelBlock("@layer base { @media (x) { a { b: c } } }", "@media (x)")).toBeNull();
    expect(topLevelBlock("@media (x) { a { b: c } }", "@media (x)")).toBe(" a { b: c } ");
  });
});
