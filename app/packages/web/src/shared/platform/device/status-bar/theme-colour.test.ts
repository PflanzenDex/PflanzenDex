// US-QS-25 · The status bar follows the page, also while a sheet or dialog dims it (issue 1691). The colour constants
// are read against the files they copy (tokens.css, index.html, the overlays), so a change of one of them fails here.
// US-QS-32 · SG-COLOR-07 (issue 1867): the backdrop is the scrim token, black at SCRIM_OPACITY in both schemes, and the
// dimmed status bar is the scrim over the page background.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAGE_BACKGROUND, SCRIM_OPACITY, dimmedPageColour } from "./theme-colour";

const here = (path: string) => new URL(path, import.meta.url);
const tokens = readFileSync(here("../../../../styles/tokens.css"), "utf8");
const indexHtml = readFileSync(here("../../../../../index.html"), "utf8");
const dialogSource = readFileSync(here("../../../ui/dialog.tsx"), "utf8");
const sheetSource = readFileSync(here("../../../ui/sheet.panel.tsx"), "utf8");

const darkAt = tokens.search(/^@media \(prefers-color-scheme: dark\) \{/m);
const lightRoot = tokens.slice(0, darkAt);
const darkRoot = tokens.slice(darkAt);
const BACKGROUND = /--background:\s*(#[0-9a-fA-F]{6});/;
const THEME_META =
  /<meta name="theme-color" content="(#[0-9a-fA-F]{6})" media="\(prefers-color-scheme: (light|dark)\)"/g;
const hexOf = (css: string, pattern: RegExp) => css.match(pattern)?.[1]?.toLowerCase();

describe("US-QS-25 · the status bar follows the page: colour constants", () => {
  it("US-QS-25 the page colour of the status bar is the background token in light and dark", () => {
    expect(PAGE_BACKGROUND).toEqual({
      light: hexOf(lightRoot, BACKGROUND),
      dark: hexOf(darkRoot, BACKGROUND),
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

  it("US-QS-25 the sheet and the dialog put the status bar dimming inside their backdrop", () => {
    expect(dialogSource).toContain("<StatusBarDim />");
    expect(sheetSource).toContain("<StatusBarDim />");
  });
});

describe("US-QS-32 · SG-COLOR-07 the backdrop of a sheet or dialog is the scrim", () => {
  it("US-QS-32 · SG-COLOR-07 the scrim is black at the scrim opacity in both schemes, and it is exposed to Tailwind", () => {
    expect(SCRIM_OPACITY).toBe(0.45);
    expect(lightRoot).toContain(`--scrim: rgb(0 0 0 / ${SCRIM_OPACITY});`);
    expect(darkRoot).toContain(`--scrim: rgb(0 0 0 / ${SCRIM_OPACITY});`);
    expect(tokens).toContain("--color-scrim: var(--scrim);");
  });

  it("US-QS-32 · SG-COLOR-07 the sheet and the dialog overlays use the scrim class, never the foreground", () => {
    for (const source of [dialogSource, sheetSource]) {
      expect(source).toContain("bg-scrim");
      expect(source).not.toMatch(/bg-foreground\//);
    }
  });

  it("US-QS-32 · SG-COLOR-07 the dimmed status bar is black at 45 % over the page background: #8a8a8a light, #060607 dark", () => {
    expect(dimmedPageColour("light")).toBe("#8a8a8a");
    expect(dimmedPageColour("dark")).toBe("#060607");
  });

  it("US-QS-32 · SG-COLOR-07 the dimmed status bar stays darker than the page in both schemes", () => {
    for (const scheme of ["light", "dark"] as const) {
      const page = PAGE_BACKGROUND[scheme];
      const dimmed = dimmedPageColour(scheme);
      expect(Number.parseInt(dimmed.slice(1, 3), 16)).toBeLessThan(
        Number.parseInt(page.slice(1, 3), 16),
      );
    }
  });
});
