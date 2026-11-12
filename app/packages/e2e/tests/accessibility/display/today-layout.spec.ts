import type { Locator, Page } from "@playwright/test";
import { signInToApp } from "../../../support/display/display";
import { expect, test } from "../../../support/fixtures";
import { answerOverview } from "./today-overview";

// US-QS-18 (issue 1662): on a phone the settled "Heute" never lets one element cover another. The anniversaries are a tile
// after the overview, so without room for the further tasks it lands on their rows, their pager and the line below them.
// The overview's reads come from the fixture of support/today-overview.ts.

type Box = { x: number; y: number; width: number; height: number };

const boxOf = async (locator: Locator): Promise<Box> => {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error("the element has no box");
  return box;
};

/** Whether two boxes share a point: one covers the other, or lies on it. */
const sharePoint = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Scrolls the element into the middle of its scroll area, then asks the browser what it hits at its centre. */
async function hitsItself(target: Locator): Promise<boolean> {
  return target.evaluate((el) => {
    el.scrollIntoView({ block: "center" });
    const box = el.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && el.contains(hit);
  });
}

/** On the settled "Heute", the anniversaries tile covers neither the further tasks, their pager nor the later line, and they are hit. */
async function expectNoCover(page: Page, size: string): Promise<void> {
  const tile = await boxOf(page.getByRole("button", { name: /Jubiläen$/ }));
  const later = page.getByText("3 Termine später", { exact: true });
  const weiter = page.getByRole("button", { name: "Weiter", exact: true });
  const parts: Record<string, Locator> = {
    "the further tasks": page.getByRole("list", { name: "Weitere Aufgaben" }),
    "the pager Zurück": page.getByRole("button", { name: "Zurück", exact: true }),
    "the pager Weiter": weiter,
    "the later line": later,
  };
  for (const [name, part] of Object.entries(parts)) {
    expect(
      sharePoint(await boxOf(part), tile),
      `${size}: the anniversaries tile covers ${name}`,
    ).toBe(false);
  }
  expect(await hitsItself(later), `${size}: another element is hit at the later line`).toBe(true);
  expect(await hitsItself(weiter), `${size}: another element is hit at Weiter`).toBe(true);
}

test.describe("US-QS-18 Heute at 360 px", () => {
  test("US-QS-18: Heute at 360 px: the anniversaries tile covers neither the pager nor the later line (issue 1662)", async ({
    page,
    account,
  }, info) => {
    test.skip(
      info.project.name !== "mobil",
      "a phone width: the desktop project is not sized for 360 px",
    );
    await answerOverview(page);
    await signInToApp(page, account);
    for (const [width, height] of [
      [360, 640],
      [360, 716],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expectNoCover(page, `${width}x${height}`);
    }
  });

  test("US-QS-18: Heute at 360 px and 200 % text: the tile stays clear of the further tasks and the page scrolls to them (issue 1662)", async ({
    page,
    account,
  }, info) => {
    test.skip(
      info.project.name !== "mobil",
      "a phone width: the desktop project is not sized for 360 px",
    );
    await answerOverview(page);
    await signInToApp(page, account);
    await page.setViewportSize({ width: 360, height: 640 });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await expectNoCover(page, "360x640 at 200 %");
    // The content is taller than the window and scrolls inside the frame; it does not collapse under the tile.
    expect(
      await page.locator("[data-fit-fill]").evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
  });

  test("US-QS-14: Heute taller than the window: scrolled to the end, Weiter lies fully above the bottom bar (issue 1835)", async ({
    page,
    account,
  }, info) => {
    test.skip(
      info.project.name !== "mobil",
      "a phone width: the desktop project is not sized for 360 px",
    );
    await answerOverview(page);
    await signInToApp(page, account);
    await page.setViewportSize({ width: 360, height: 640 });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    const frame = page.locator("[data-fit-fill]");
    expect(await frame.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await frame.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    const weiter = await boxOf(page.getByRole("button", { name: "Weiter", exact: true }));
    const bar = await boxOf(page.locator("nav[data-bottom-bar]"));
    expect(
      weiter.y + weiter.height,
      "the bottom of Weiter against the top of the bar",
    ).toBeLessThanOrEqual(bar.y);
  });
});
