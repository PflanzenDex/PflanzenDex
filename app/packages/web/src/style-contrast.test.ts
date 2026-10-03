// Issue #249: the footer "Version …" text must reach WCAG AA (4.5:1) in the light and the dark scheme.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const darkAt = css.indexOf("@media (prefers-color-scheme: dark)");

function tokens(block: string): Map<string, string> {
  return new Map(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1] ?? "", m[2] ?? ""]),
  );
}
const light = tokens(css.slice(0, darkAt));
const dark = new Map([...light, ...tokens(css.slice(darkAt, css.indexOf("* {")))]);
const footerRule = /\.version-footer\s*{([^}]*)}/.exec(css)?.[1] ?? "";
const colorToken = /color:\s*var\(--([\w-]+)\)/.exec(footerRule)?.[1] ?? "text";
const opacity = Number(/opacity:\s*([\d.]+)/.exec(footerRule)?.[1] ?? 1);

const channels = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Text colour as drawn: the token blended with the background by the element's opacity. */
function effective(fg: string, bg: string): number[] {
  const b = channels(bg);
  return channels(fg).map((f, i) => f * opacity + (b[i] ?? 0) * (1 - opacity));
}
function luminance(rgb: number[]): number {
  const [r = 0, g = 0, b = 0] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function footerRatio(scheme: Map<string, string>): number {
  const bg = scheme.get("grund") ?? "";
  const [hi = 0, lo = 0] = [
    luminance(effective(scheme.get(colorToken) ?? "", bg)),
    luminance(channels(bg)),
  ].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("Issue #249 footer contrast", () => {
  it("Issue #249: the footer does not fade its text with opacity", () => {
    expect(footerRule).not.toMatch(/opacity/);
  });
  it("Issue #249: footer text reaches 4.5:1 on the page background in the light scheme", () => {
    expect(footerRatio(light)).toBeGreaterThanOrEqual(4.5);
  });
  it("Issue #249: footer text reaches 4.5:1 on the page background in the dark scheme", () => {
    expect(footerRatio(dark)).toBeGreaterThanOrEqual(4.5);
  });
});
