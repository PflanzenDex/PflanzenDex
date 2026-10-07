// US-QS-07 · DS-20: every text pair of the semantic tokens reaches WCAG AA (4.5:1 text, 3:1 UI) in light and dark.
// Issue #249 (footer text) stays covered. The tokens live in styles/tokens.css (DS-28, DS-30).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokensCss = readFileSync(new URL("./styles/tokens.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

type Rgb = [number, number, number];

/** sRGB (0..255) of `#rgb`, `#rrggbb` or `oklch(L C h)`; throws on any other notation so a new one cannot slip by. */
function toSrgb(value: string): Rgb {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
  }
  const ok = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/i.exec(v);
  if (!ok) throw new Error(`Unsupported colour notation: ${value}`);
  const l = Number(ok[1]) / (ok[2] ? 100 : 1);
  const a = Number(ok[3]) * Math.cos((Number(ok[4]) * Math.PI) / 180);
  const b = Number(ok[3]) * Math.sin((Number(ok[4]) * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return lin.map((c) => {
    const x = Math.min(1, Math.max(0, c));
    return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
  }) as Rgb;
}

function luminance(rgb: Rgb): number {
  const [r = 0, g = 0, b = 0] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: Rgb, bg: Rgb): number {
  const [hi = 0, lo = 0] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text colour as drawn: the colour blended with the background by the element's opacity. */
function blend(fg: Rgb, bg: Rgb, opacity: number): Rgb {
  return fg.map((f, i) => f * opacity + (bg[i] ?? 0) * (1 - opacity)) as Rgb;
}

// --- tokens.css -------------------------------------------------------------------------------------------------

function declarations(block: string): Map<string, string> {
  return new Map(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? "", (m[2] ?? "").trim()]),
  );
}
/** Body of the first `:root { … }` in `css` (no nested braces in the token blocks). */
function rootBlock(css: string): string {
  const open = /^\s*:root\s*{/m.exec(css);
  if (!open) throw new Error("tokens.css has no :root block");
  const from = open.index + open[0].length;
  return css.slice(from, from + css.slice(from).search(/\n\s*}/));
}
const darkMedia = tokensCss.search(/^@media \(prefers-color-scheme: dark\)/m);
const lightDecl = declarations(rootBlock(tokensCss.slice(0, darkMedia)));
const darkDecl = new Map([...lightDecl, ...declarations(rootBlock(tokensCss.slice(darkMedia)))]);

function resolve(scheme: Map<string, string>, name: string): Rgb {
  let value = scheme.get(name);
  for (let depth = 0; value?.startsWith("var("); depth++) {
    if (depth > 5) throw new Error(`--${name} has a var() cycle`);
    value = scheme.get(/var\(--([\w-]+)\)/.exec(value)?.[1] ?? "");
  }
  if (value === undefined) throw new Error(`--${name} is not defined`);
  return toSrgb(value);
}

/** Tokens that are not colours (US-QS-14): elevation (shadows) and motion (durations). */
const NOT_COLORS = /^(radius|elevation-|motion-)/;
const colorTokens = [...lightDecl.keys()].filter((n) => !NOT_COLORS.test(n));

/** Text pairs (4.5:1): foreground token on surface token. */
const TEXT_PAIRS: [string, string][] = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["muted-foreground", "background"],
  ["muted-foreground", "muted"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["warning-foreground", "warning"],
  ["primary", "background"],
  ["primary", "card"],
  ["destructive", "background"],
  ["destructive", "card"],
  ...["zone-1", "zone-2", "zone-3", "zone-4", "phase-growth", "phase-dormancy"].flatMap(
    (t): [string, string][] => [
      [t, "background"],
      [t, "card"],
    ],
  ),
];
/** UI components (3:1, WCAG 1.4.11): the focus ring, the field boundary (`--input`) and the invalid-field border. */
const UI_PAIRS: [string, string][] = [
  ["ring", "background"],
  ["ring", "card"],
  ["input", "background"],
  ["input", "card"],
  ["destructive", "background"],
  ["destructive", "card"],
  ["warning-border", "warning"], // US-QS-14: ADR 0011 pair, the edge of the warning box on its fill
];
/**
 * Tokens that are only decorative lines (cards, dividers, the edge of a warning box whose text carries the message),
 * never the only cue: no ratio required (WCAG 1.4.11). `--warning-border` is 2.7:1 in light, as before the migration.
 */
const DECORATIVE = ["border", "warning-border"];

const pairedTokens = new Set([...TEXT_PAIRS, ...UI_PAIRS].flat());

describe.each([
  ["light", lightDecl],
  ["dark", darkDecl],
] as const)("US-QS-07 · DS-20 contrast in the %s scheme", (scheme, decl) => {
  it.each(TEXT_PAIRS)("US-QS-07 · DS-20 text --%s on --%s reaches 4.5:1", (fg, bg) => {
    expect(contrast(resolve(decl, fg), resolve(decl, bg))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(UI_PAIRS)("US-QS-07 · DS-20 UI colour --%s against --%s reaches 3:1", (fg, bg) => {
    expect(contrast(resolve(decl, fg), resolve(decl, bg))).toBeGreaterThanOrEqual(3);
  });
  it(`US-QS-07 · DS-28 every colour token is defined in the ${scheme} scheme`, () => {
    for (const name of colorTokens) expect(() => resolve(decl, name), name).not.toThrow();
  });
});

describe("US-QS-07 · DS-20 token coverage", () => {
  it("US-QS-07 · DS-20 every colour token is in a contrast pair or listed as decorative", () => {
    const unpaired = colorTokens.filter((n) => !pairedTokens.has(n) && !DECORATIVE.includes(n));
    expect(unpaired).toEqual([]);
  });
  it("US-QS-07 · DS-28 the dark scheme redefines every literal colour of the light scheme", () => {
    const darkOwn = declarations(rootBlock(tokensCss.slice(darkMedia)));
    const literal = colorTokens.filter((n) => !(lightDecl.get(n) ?? "").startsWith("var("));
    expect(literal.filter((n) => !darkOwn.has(n))).toEqual([]);
  });
  it("US-QS-07 · DS-28 tokens are exposed to Tailwind with @theme inline", () => {
    expect(tokensCss).toMatch(/@theme inline\s*{/);
    for (const name of colorTokens)
      expect(tokensCss, name).toContain(`--color-${name}: var(--${name})`);
  });
  it("US-QS-07 · DS-28 no German token names remain in the stylesheets", () => {
    expect(tokensCss).not.toMatch(/--(grund|gruen|rand|leise|warn-|fehler)/);
  });
});

describe("US-QS-07 · DS-20 colour helper", () => {
  it("US-QS-07 · DS-20 reads hex and OKLCH and rejects other notations", () => {
    expect(toSrgb("#2f7d4f")).toEqual([47, 125, 79]);
    expect(toSrgb("#fff")).toEqual([255, 255, 255]);
    expect(toSrgb("oklch(1 0 0)")).toEqual([255, 255, 255]);
    expect(toSrgb("oklch(0 0 0)")).toEqual([0, 0, 0]);
    const [r = 0, g = 0, b = 0] = toSrgb("oklch(0.628 0.2577 29.23)"); // sRGB red
    expect(r).toBeGreaterThan(250);
    expect(g).toBeLessThan(5);
    expect(b).toBeLessThan(5);
    expect(() => toSrgb("rgb(0 0 0)")).toThrow();
  });
  it("US-QS-07 · DS-20 computes the WCAG ratio (black on white is 21:1)", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrast([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
  });
});

// --- Issue #249: footer ----------------------------------------------------------------------------------------

const footerClasses = /<footer className="([^"]*)"/.exec(appSource)?.[1] ?? "";
const footerToken =
  /(?:^|\s)text-([a-z-]+)(?=\s|$)/.exec(
    footerClasses.replace(/text-(xs|sm|base|center)/g, ""),
  )?.[1] ?? "foreground";
const opacity = Number(/(?:^|\s)opacity-(\d+)/.exec(footerClasses)?.[1] ?? 100) / 100;

function footerRatio(decl: Map<string, string>): number {
  const bg = resolve(decl, "background");
  return contrast(blend(resolve(decl, footerToken), bg, opacity), bg);
}

describe("Issue #249 footer contrast", () => {
  it("Issue #249: the footer does not fade its text with opacity", () => {
    expect(footerClasses).toBeTruthy();
    expect(footerClasses).not.toMatch(/opacity/);
  });
  it("Issue #249: footer text reaches 4.5:1 on the page background in the light scheme", () => {
    expect(footerRatio(lightDecl)).toBeGreaterThanOrEqual(4.5);
  });
  it("Issue #249: footer text reaches 4.5:1 on the page background in the dark scheme", () => {
    expect(footerRatio(darkDecl)).toBeGreaterThanOrEqual(4.5);
  });
});
