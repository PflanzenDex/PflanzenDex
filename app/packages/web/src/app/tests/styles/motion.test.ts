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

  it("US-QS-14 the old and the new page keep their end state until the cross-fade ends, so the old page never flashes back (issue 1641)", () => {
    const rule = css.slice(
      css.indexOf("::view-transition-old(page),\n::view-transition-new(page) {"),
    );
    const body = rule.slice(0, rule.indexOf("}"));
    expect(body).toMatch(/animation-fill-mode: both;/);
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

describe("US-QS-33 · 'Bewegung aus' in tokens.css", () => {
  it("US-QS-33 the page marked data-motion=reduced gets zero motion tokens and ends every animation and transition at once", () => {
    const start = css.indexOf(':root[data-motion="reduced"] {');
    expect(start).toBeGreaterThan(-1);
    const tokens = css.slice(start, css.indexOf("}", start));
    expect(tokens).toMatch(/--motion-fast: 0ms;/);
    expect(tokens).toMatch(/--motion-base: 0ms;/);
    expect(tokens).toMatch(/--motion-slow: 0ms;/);
    const all = css.slice(css.indexOf(':root[data-motion="reduced"] *,'));
    const body = all.slice(0, all.indexOf("}"));
    expect(body).toContain(':root[data-motion="reduced"] ::before');
    expect(body).toMatch(/animation-duration: 1ms !important;/);
    expect(body).toMatch(/transition-duration: 1ms !important;/);
    expect(body).toMatch(/scroll-behavior: auto !important;/);
  });

  it("US-QS-33 the view transition pseudo-elements get no duration under 'Bewegung aus'", () => {
    expect(css).toMatch(
      /:root\[data-motion="reduced"\]::view-transition-group\(\*\),\s*:root\[data-motion="reduced"\]::view-transition-old\(\*\),\s*:root\[data-motion="reduced"\]::view-transition-new\(\*\) \{\s*animation-duration: 0s !important;/,
    );
  });

  it("US-QS-33 the motion-reduce variant of the classes covers the device setting and the account choice", () => {
    const start = css.indexOf("@custom-variant motion-reduce {");
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf("\n}\n", start));
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*@slot;/);
    expect(block).toMatch(/:root\[data-motion="reduced"\] & \{\s*@slot;/);
  });
});
