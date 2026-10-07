// US-QS-14 · ADR 0011 decisions 2 to 5: the Greenhouse tokens (colour values, type scale, radius, elevation, motion).
// The contrast of every pair is in style-contrast.test.ts; this file pins the values and the structure of tokens.css.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles/tokens.css", import.meta.url), "utf8");
const darkAt = css.search(/^@media \(prefers-color-scheme: dark\)/m);
const reducedAt = css.search(/^@media \(prefers-reduced-motion: reduce\)/m);
const block = (from: number): string =>
  css.slice(css.indexOf("{", from) + 1, css.indexOf("\n  }", from));
/** First declaration of `--name` in `text` (the light value, before any later override). */
const decl = (text: string, name: string): string | undefined =>
  [...text.matchAll(/--([\w-]+):\s*([^;]+);/g)].find((m) => m[1] === name)?.[2]?.trim();

const LIGHT = {
  background: "#f2f6f3",
  foreground: "#14201a",
  card: "#ffffff",
  primary: "#1b6b4a",
  "primary-foreground": "#ffffff",
  secondary: "#e6eee8",
  "secondary-foreground": "#14201a",
  muted: "#e6eee8",
  "muted-foreground": "#4b5c52",
  accent: "#d8eedf",
  "accent-foreground": "#124a32",
  destructive: "#b3261e",
  "destructive-foreground": "#ffffff",
  border: "#d3ded6",
  input: "#6b8274",
  ring: "#1b6b4a",
  warning: "#fff1cf",
  "warning-foreground": "#6b4700",
  "warning-border": "#8a5a00",
};
const DARK = {
  background: "#0f1612",
  foreground: "#e6efe9",
  card: "#18221c",
  primary: "#7bd3a0",
  "primary-foreground": "#0b2316",
  secondary: "#223028",
  "secondary-foreground": "#e6efe9",
  muted: "#18221c",
  "muted-foreground": "#a5b6ab",
  accent: "#1f3a2b",
  "accent-foreground": "#a9e8c4",
  destructive: "#ff8a80",
  "destructive-foreground": "#2a0a08",
  border: "#2b3b31",
  input: "#6f8c79",
  ring: "#7bd3a0",
  warning: "#3a2f10",
  "warning-foreground": "#f2c766",
  "warning-border": "#e0a92e",
};
const ZONES_LIGHT = {
  "zone-1": "#8a5a00",
  "zone-2": "#4d6b00",
  "zone-3": "#1f6b3a",
  "zone-4": "#0b6a8a",
  "phase-growth": "#1f6b3a",
  "phase-dormancy": "#3f5f9a",
};
const ZONES_DARK = {
  "zone-1": "#e0a92e",
  "zone-2": "#b4d15a",
  "zone-3": "#5fbf86",
  "zone-4": "#6cc4e3",
  "phase-growth": "#7fd29d",
  "phase-dormancy": "#9db8f0",
};

describe("US-QS-14 · ADR 0011 decision 2 colour tokens", () => {
  it.each(Object.entries(LIGHT))("US-QS-14 light --%s is %s", (name, value) => {
    expect(decl(css.slice(0, darkAt), name)).toBe(value);
  });
  it.each(Object.entries(DARK))("US-QS-14 dark --%s is %s", (name, value) => {
    expect(decl(block(darkAt), name)).toBe(value);
  });
  it.each(Object.entries(ZONES_LIGHT))(
    "US-QS-14 domain colour --%s is unchanged in light",
    (name, value) => {
      expect(decl(css.slice(0, darkAt), name)).toBe(value);
    },
  );
  it.each(Object.entries(ZONES_DARK))(
    "US-QS-14 domain colour --%s is unchanged in dark",
    (name, value) => {
      expect(decl(block(darkAt), name)).toBe(value);
    },
  );
});

describe("US-QS-14 · ADR 0011 decision 3 typography", () => {
  const fontFace = /@font-face\s*{[^}]*}/.exec(css)?.[0] ?? "";
  it("US-QS-14 Figtree is self-hosted as WOFF2 with font-display swap and the file and licence exist", () => {
    expect(fontFace).toContain('font-family: "Figtree"');
    expect(fontFace).toContain("font-display: swap");
    expect(fontFace).toMatch(/font-weight:\s*300 900/);
    const file = /url\("\.\/(fonts\/[^"]+\.woff2)"\)/.exec(fontFace)?.[1];
    expect(file).toBeTruthy();
    expect(existsSync(new URL(`./styles/${file}`, import.meta.url))).toBe(true);
    expect(readFileSync(new URL("./styles/fonts/ofl.txt", import.meta.url), "utf8")).toContain(
      "SIL Open Font License",
    );
  });
  it("US-QS-14 no request goes to a third-party host", () => {
    expect(css).not.toMatch(/https?:\/\//);
  });
  it("US-QS-14 the font stack falls back to system-ui and sans-serif", () => {
    expect(css).toContain('--font-sans: "Figtree", system-ui, sans-serif;');
  });
  it("US-QS-14 the type scale is 12, 13, 14, 16, 18, 22, 28, 32, 40 px in rem", () => {
    const scale = ["xs", "label", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"].map((n) =>
      decl(css, `text-${n}`),
    );
    expect(scale).toEqual([
      "0.75rem",
      "0.8125rem",
      "0.875rem",
      "1rem",
      "1.125rem",
      "1.375rem",
      "1.75rem",
      "2rem",
      "2.5rem",
    ]);
  });
  it("US-QS-14 body text has line height 1.45 and headings 1.25", () => {
    const base = /@layer base\s*{([\s\S]*?)\n}/.exec(css)?.[1] ?? "";
    expect(/body\s*{[^}]*line-height:\s*1\.45/.test(base)).toBe(true);
    expect(/h1,\s*h2,\s*h3\s*{[^}]*line-height:\s*1\.25/.test(base)).toBe(true);
  });
});

describe("US-QS-14 · ADR 0011 decision 4 radius and elevation", () => {
  it("US-QS-14 radius tokens are control 14, tile 16, card 22 and pill 9999 px", () => {
    expect(["control", "tile", "card", "pill"].map((n) => decl(css, `radius-${n}`))).toEqual([
      "14px",
      "16px",
      "22px",
      "9999px",
    ]);
  });
  it("US-QS-14 the Tailwind radius steps lg, xl and 2xl resolve to control, tile and card", () => {
    expect([decl(css, "radius-lg"), decl(css, "radius-xl"), decl(css, "radius-2xl")]).toEqual([
      "var(--radius-control)",
      "var(--radius-tile)",
      "var(--radius-card)",
    ]);
    expect(css).not.toMatch(/--radius:/);
  });
  it("US-QS-14 elevation uses rgb(20 40 28 / 0.08) in light and rgb(0 0 0 / 0.35) plus a border in dark", () => {
    const light = css.slice(0, darkAt);
    expect(decl(light, "elevation-1")).toBe(
      "0 1px 2px rgb(20 40 28 / 0.08), 0 6px 16px rgb(20 40 28 / 0.08)",
    );
    expect(decl(light, "elevation-2")).toContain("rgb(20 40 28 / 0.08)");
    const dark = block(darkAt);
    expect(decl(dark, "elevation-1")).toBe(
      "0 1px 2px rgb(0 0 0 / 0.35), 0 6px 16px rgb(0 0 0 / 0.35)",
    );
    expect(decl(dark, "elevation-2")).toContain("rgb(0 0 0 / 0.35)");
    expect(decl(dark, "elevation-2-border")).toBe("var(--border)");
  });
});

describe("US-QS-14 · ADR 0011 decision 5 motion", () => {
  it("US-QS-14 motion tokens are 120, 200 and 320 ms with the enter and leave easings", () => {
    expect(["fast", "base", "slow"].map((n) => decl(css, `motion-${n}`))).toEqual([
      "120ms",
      "200ms",
      "320ms",
    ]);
    expect(decl(css, "ease-enter")).toBe("cubic-bezier(0.2, 0, 0, 1)");
    expect(decl(css, "ease-leave")).toBe("cubic-bezier(0.4, 0, 1, 1)");
  });
  it("US-QS-14 under prefers-reduced-motion the three durations are 0ms", () => {
    expect(reducedAt).toBeGreaterThan(-1);
    const reduced = css.slice(reducedAt);
    expect(["fast", "base", "slow"].map((n) => decl(reduced, `motion-${n}`))).toEqual([
      "0ms",
      "0ms",
      "0ms",
    ]);
  });
});
