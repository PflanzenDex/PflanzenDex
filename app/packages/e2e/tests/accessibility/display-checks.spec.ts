import { expect, test } from "@playwright/test";
import {
  controlsWithoutBoundary,
  focusIndicator,
  layoutProblems,
  tooltips,
  unreadableStatusTexts,
} from "../../support/display";

// US-QS-12: the measurements behind the adaptable display tests must find what they look for, or a green run says
// nothing. Each one runs against a small page with a known defect and against the same page without it.

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
