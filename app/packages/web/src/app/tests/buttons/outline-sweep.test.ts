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
 * The file of "Sammlung" and of the app shell that still uses the deprecated outline look: the one that issue 1432 owns
 * until it merges. Every other file of the two areas moved to filled, tinted or plain (FX-39). The lock page moved in
 * sweep 3 (issue 2207).
 */
const STILL_OUTLINE = new Set(["collection/other-pages/pot-label-page/pot-label-page.tsx"]);

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
  it("US-QS-32 · SG-BTN-01 no file of collection/ or app/ takes the outline look, except the one of issue 1432", () => {
    const using = [...sources("collection"), ...sources("app")].filter(
      (f) => outlineButtons(readFileSync(join(root, f), "utf8")) > 0,
    );
    expect(using.filter((f) => !STILL_OUTLINE.has(f))).toEqual([]);
  });

  it("US-QS-32 · SG-BTN-01 the file that is left still uses it, so the list above shrinks when it moves", () => {
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

/** The areas of FX-39 sweep 2 (issue 2206): friends and the exchange, the wishlist and the invitation page. */
const SWEEP_2 = ["social", "swap", "wishlist", "account/invitation-page"];

describe("US-QS-32 · SG-BTN-01 there is no outline button in Freunde, the exchange, the wishlist and the invitation page (FX-39 sweep 2)", () => {
  it("US-QS-32 · SG-BTN-01 no file of social/, swap/, wishlist/ or the invitation page takes the outline look", () => {
    const using = SWEEP_2.flatMap(sources).filter(
      (f) => outlineButtons(readFileSync(join(root, f), "utf8")) > 0,
    );
    expect(using).toEqual([]);
  });

  it("US-QS-32 · SG-BTN-01 the guard sees a button of these areas but not a badge of the same variant name", () => {
    expect(outlineButtons('<Button variant="outline" size="touch">Prüfen</Button>')).toBe(1);
    expect(outlineButtons('<Badge variant="outline">Neu</Badge>')).toBe(0);
    expect(SWEEP_2.flatMap(sources).length).toBeGreaterThan(30);
  });
});

/** The areas of FX-39 sweep 3 (issue 2207): care, light, equipment, monitoring, Heute and the account area. */
const SWEEP_3 = ["care", "light", "equipment", "monitoring", "today", "account"];

describe("US-QS-32 · SG-BTN-01 there is no outline button in care, light, equipment, monitoring, Heute and account (FX-39 sweep 3)", () => {
  it("US-QS-32 · SG-BTN-01 no file of care/, light/, equipment/, monitoring/, today/ or account/ takes the outline look", () => {
    const using = SWEEP_3.flatMap(sources).filter(
      (f) => outlineButtons(readFileSync(join(root, f), "utf8")) > 0,
    );
    expect(using).toEqual([]);
  });

  it("US-QS-32 · SG-BTN-01 the guard reads the sources of all six areas, so an empty list means none is left", () => {
    for (const area of SWEEP_3) expect(sources(area).length, area).toBeGreaterThan(5);
  });
});
