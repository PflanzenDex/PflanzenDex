// US-QS-25 · The status bar follows the page, also while a sheet or dialog dims it (issue 1691). The colour constants
// are read against the files they copy (tokens.css, index.html, the overlays), so a change of one of them fails here.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BACKDROP_OPACITY,
  PAGE_BACKGROUND,
  PAGE_FOREGROUND,
  dimmedPageColour,
} from "./theme-colour";

const here = (path: string) => new URL(path, import.meta.url);
const tokens = readFileSync(here("../../../../styles/tokens.css"), "utf8");
const indexHtml = readFileSync(here("../../../../../index.html"), "utf8");
const dialogSource = readFileSync(here("../../../ui/overlays/dialog/dialog.tsx"), "utf8");
const sheetSource = readFileSync(
  here("../../../ui/overlays/sheet/sheet-panel/sheet-panel.tsx"),
  "utf8",
);

const darkAt = tokens.search(/^@media \(prefers-color-scheme: dark\) \{/m);
const lightRoot = tokens.slice(0, darkAt);
const darkRoot = tokens.slice(darkAt);
const BACKGROUND = /--background:\s*(#[0-9a-fA-F]{6});/;
const FOREGROUND = /--foreground:\s*(#[0-9a-fA-F]{6});/;
const THEME_META =
  /<meta name="theme-color" content="(#[0-9a-fA-F]{6})" media="\(prefers-color-scheme: (light|dark)\)"/g;
const hexOf = (css: string, pattern: RegExp) => css.match(pattern)?.[1]?.toLowerCase();

describe("US-QS-25 · the status bar follows the page: colour constants", () => {
  it("US-QS-25 the page colours of the status bar are the background and foreground tokens in light and dark", () => {
    expect(PAGE_BACKGROUND).toEqual({
      light: hexOf(lightRoot, BACKGROUND),
      dark: hexOf(darkRoot, BACKGROUND),
    });
    expect(PAGE_FOREGROUND).toEqual({
      light: hexOf(lightRoot, FOREGROUND),
      dark: hexOf(darkRoot, FOREGROUND),
    });
  });

  it("US-QS-25 the theme-colour metas of index.html are the page background of their scheme, the colour the status bar returns to", () => {
    const metas = [...indexHtml.matchAll(THEME_META)].map(([, colour = "", scheme]) => ({
      scheme,
      colour: colour.toLowerCase(),
    }));
    expect(metas).toEqual([
      { scheme: "light", colour: PAGE_BACKGROUND.light },
      { scheme: "dark", colour: PAGE_BACKGROUND.dark },
    ]);
  });

  it("US-QS-25 the backdrop of the sheet and of the dialog is the foreground at the backdrop opacity (50 %)", () => {
    expect(BACKDROP_OPACITY).toBe(0.5);
    expect(dialogSource).toContain(`bg-foreground/${BACKDROP_OPACITY * 100}`);
    expect(sheetSource).toContain(`bg-foreground/${BACKDROP_OPACITY * 100}`);
  });

  it("US-QS-25 the sheet and the dialog put the status bar dimming inside their backdrop", () => {
    expect(dialogSource).toContain("<StatusBarDim />");
    expect(sheetSource).toContain("<StatusBarDim />");
  });

  it("US-QS-25 the dimmed page colour is the foreground at 50 % composited over the background: #89898b light, #808081 dark", () => {
    expect(dimmedPageColour("light")).toBe("#89898b");
    expect(dimmedPageColour("dark")).toBe("#808081");
  });
});
