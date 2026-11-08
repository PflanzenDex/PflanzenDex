// US-QS-14 · ADR 0011 decision 5: the motion rules in tokens.css (route cross-fade, list entry, reduced motion).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../../styles/tokens.css", import.meta.url), "utf8");

describe("US-QS-14 · motion in tokens.css", () => {
  it("US-QS-14 the cross-fade is limited to the main content and uses the slow motion token", () => {
    expect(css).toMatch(/:root\[data-route-transition\] main \{\s*view-transition-name: page;/);
    expect(css).toMatch(
      /::view-transition-old\(page\),\s*::view-transition-new\(page\) \{\s*animation-duration: var\(--motion-slow\);/,
    );
  });

  it("US-QS-14 reduced motion: the transition pseudo-elements get no duration, the list entry follows the token", () => {
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/::view-transition-old\(\*\)/);
    expect(reduced).toMatch(/animation-duration: 0s !important/);
    expect(css).toMatch(/--animate-list-in: list-in var\(--motion-base\)/);
    expect(css).toMatch(/--motion-base: 0ms/);
  });

  it("US-QS-14 · F13 a sheet and its overlay run the slow motion token, not Vaul's 500 ms default, without !important", () => {
    // Vaul injects its own rules (500 ms on the drawer and the overlay); these selectors are more specific and unlayered.
    const start = css.indexOf("[data-vaul-drawer][data-state],");
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf("}", start) + 1);
    expect(block).toContain("[data-vaul-overlay][data-vaul-snap-points][data-state]");
    expect(block).toMatch(/animation-duration: var\(--motion-slow\);/);
    expect(block).not.toContain("!important");
  });

  it("US-QS-14 list entry moves only transform and opacity, so nothing shifts", () => {
    const keyframes = css.slice(css.indexOf("@keyframes list-in"));
    const body = keyframes.slice(0, keyframes.indexOf("\n  }\n") + 5);
    const props = [...body.matchAll(/^\s+([a-z-]+):/gm)].map((m) => m[1]);
    expect(props.filter((p) => p !== "from")).toEqual(["opacity", "transform"]);
  });
});
