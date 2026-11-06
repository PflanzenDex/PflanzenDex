import { expect, type Page, test } from "@playwright/test";
import {
  controlsWithoutBoundary,
  focusIndicator,
  layoutProblems,
  tooltips,
  unreadableStatusTexts,
} from "../../support/display/display";

// US-QS-12: the measurements behind the adaptable display tests must find what they look for, or a green run says
// nothing. Each one runs against a small page with a known defect and against the same page without it.

/** Real clamped CSS (US-QS-12): three lines in a 200 px box, so the text overflows below. */
const CLAMP =
  "display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; width: 200px";
const COLLAPSED = `<button aria-expanded="false">Mehr anzeigen</button>`;
const OPEN = `<button aria-expanded="true">Weniger anzeigen</button>`;

/** A clamped text beside the given button; `marked` puts the marker `data-clamped` on the text, `lead` starts it. */
async function setClamp(page: Page, marked: boolean, button: string, lead = ""): Promise<void> {
  const marker = marked ? ' data-clamped=""' : "";
  const sentence =
    "Ein langer Eintrag mit viel mehr Text, als drei Zeilen in dieser schmalen Box Platz haben. ";
  await page.setContent(
    `<div><p${marker} style="${CLAMP}">${lead}${sentence.repeat(3)}</p>${button}</div>`,
  );
}

/** The findings of one kind of the layout check on the page that is set. */
async function findingsOf(page: Page, kind: string): Promise<string[]> {
  return (await layoutProblems(page)).filter((p) => p.startsWith(kind));
}

test.describe("US-QS-12 adaptable display: the checks find real defects", () => {
  test.skip(({ isMobile }) => isMobile, "one run on desktop is enough");

  test("US-QS-12 the layout check finds sideways overflow and text cut off by a fixed height", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.setContent(`
      <div style="width: 600px">breit</div>
      <div style="height: 20px; overflow: hidden">Zeile eins<br>Zeile zwei<br>Zeile drei</div>
      <span style="position: absolute; width: 1px; height: 1px; overflow: hidden">nur für Vorleser</span>`);
    const problems = await layoutProblems(page);
    expect(problems.some((p) => p.startsWith("page scrolls sideways"))).toBe(true);
    expect(problems.some((p) => p.startsWith("sticks out"))).toBe(true);
    expect(problems.some((p) => p.startsWith("cuts off below"))).toBe(true);
    expect(problems.some((p) => p.includes("nur für Vorleser"))).toBe(false);

    await page.setContent(`<p>Ein Absatz, der umbricht, statt die Seite zu verbreitern.</p>`);
    expect(await layoutProblems(page)).toEqual([]);
  });

  test("US-QS-12 the layout check skips a deliberate clamp only with the button that opens it", async ({
    page,
  }) => {
    // (a) marker and a collapsed button that opens it: no cut-off below
    await setClamp(page, true, COLLAPSED);
    expect(await findingsOf(page, "cuts off below")).toEqual([]);
    // (b) marker without a button: still reported
    await setClamp(page, true, "");
    expect(await findingsOf(page, "cuts off below")).toHaveLength(1);
    // (c) marker and a button that is already open: still reported
    await setClamp(page, true, OPEN);
    expect(await findingsOf(page, "cuts off below")).toHaveLength(1);
    // (d) collapsed button without the marker: still reported
    await setClamp(page, false, COLLAPSED);
    expect(await findingsOf(page, "cuts off below")).toHaveLength(1);
    // (e) the skip covers only the cut-off below: a word wider than the box is still reported sideways
    await setClamp(page, true, COLLAPSED, "Langwort".repeat(40) + " ");
    expect(await findingsOf(page, "cuts off below")).toEqual([]);
    expect(await findingsOf(page, "cuts off sideways")).toHaveLength(1);
  });

  test("US-QS-12 the tooltip check finds title attributes and ARIA tooltips", async ({ page }) => {
    await page.setContent(`<abbr title="Lux">lx</abbr><div role="tooltip">Hilfe</div>`);
    expect(await tooltips(page)).toHaveLength(2);
  });

  test("US-QS-12 in forced colors the checks find a focus shown only as a ring and a button without border", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.setContent(`
      <button style="border: 0; outline: none; box-shadow: 0 0 0 2px green">Ring</button>
      <button style="border: 1px solid; outline: 2px solid">Rahmen</button>`);
    await page.keyboard.press("Tab");
    expect((await focusIndicator(page))?.outline).toBe("none");
    await page.keyboard.press("Tab");
    expect((await focusIndicator(page))?.outline).not.toBe("none");
    expect(await controlsWithoutBoundary(page)).toEqual(['button "Ring"']);
  });

  test("US-QS-12 the status text check finds text in the colour of its background", async ({
    page,
  }) => {
    await page.setContent(`
      <div style="background: white"><p role="status" style="color: white">unsichtbar</p></div>
      <div style="background: white"><p role="alert" style="color: black">sichtbar</p></div>`);
    expect(await unreadableStatusTexts(page)).toEqual(["unsichtbar"]);
  });
});
