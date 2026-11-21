import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}
const sources = (area: string) =>
  files(join(root, area))
    .map((f) => relative(root, f))
    .filter((f) => /\.tsx?$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f));

/**
 * The files of "Sammlung" and of the app shell that still use the deprecated outline look: the two that another open pull
 * request (issue 1432) owns, until it merges. Every other file of the two areas moved to filled, tinted or plain (FX-39).
 */
const STILL_OUTLINE = new Set([
  "app/flows/unlock/unlock-page/unlock-page.tsx",
  "collection/other-pages/pot-label-page/pot-label-page.tsx",
]);

/** The `variant: "outline"` / `variant="outline"` of a button; a badge of the same name is another component. */
function outlineButtons(text: string): number {
  let count = 0;
  for (const match of text.matchAll(/variant(?:=|: )\{?"outline"/g)) {
    const before = text.slice(0, match.index);
    const button = Math.max(before.lastIndexOf("<Button"), before.lastIndexOf("buttonVariants("));
    const badge = before.lastIndexOf("<Badge");
    if (button > badge) count += 1;
  }
  return count;
}

describe("US-QS-32 · SG-BTN-01 there is no outline button in Sammlung and the app shell (FX-39)", () => {
  it("US-QS-32 · SG-BTN-01 no file of collection/ or app/ takes the outline look, except the two of issue 1432", () => {
    const using = [...sources("collection"), ...sources("app")].filter(
      (f) => outlineButtons(readFileSync(join(root, f), "utf8")) > 0,
    );
    expect(using.filter((f) => !STILL_OUTLINE.has(f))).toEqual([]);
  });

  it("US-QS-32 · SG-BTN-01 the two files that are left still use it, so the list above shrinks when they move", () => {
    for (const f of STILL_OUTLINE) {
      expect(outlineButtons(readFileSync(join(root, f), "utf8")), f).toBeGreaterThan(0);
    }
  });

  it("US-QS-32 · SG-BTN-01 the opener of a layer says tinted, not outline, in its comments", () => {
    const text = readFileSync(
      join(root, "shared/patterns/responsive/layer-sheet/layer-sheet.tsx"),
      "utf8",
    );
    expect(text).not.toMatch(/outline by default|everything else is outline/);
  });
});
