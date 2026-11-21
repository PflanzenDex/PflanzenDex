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

/** The anniversaries tile: its name ends in its label, "1 Jubiläum" for one anniversary, "2 Jubiläen" for more (tile.label). */
const anniversariesTile = (page: Page): Locator =>
  page.getByRole("button", { name: /(Jubiläum|Jubiläen)$/ });

/**
 * After a change of the text size the overview settles: the tile loads lazily, and the app writes the reserve of `main`
 * (`--bar-reserve`, the bottom padding that the frame's height derives from) from a ResizeObserver on the bottom bar. Read
 * before that, the frame still reserves the old bar height and its bottom lies under the bar (28 px at 360 px and 200 %,
 * measured for issue 2281). The test waits for that condition, the reserve equals the bar's height (0.5 px), and assumes no
 * number of frames: a slower runner takes more of them.
 */
async function settleOverview(page: Page): Promise<void> {
  await expect(anniversariesTile(page)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const bar = document.querySelector("nav[data-bottom-bar]");
        const main = document.querySelector<HTMLElement>("main");
        const reserve = parseFloat(main?.style.getPropertyValue("--bar-reserve") ?? "");
        return (
          bar !== null &&
          Number.isFinite(reserve) &&
          Math.abs(reserve - bar.getBoundingClientRect().height) <= 0.5
        );
      }),
    )
    .toBe(true);
}

/**
 * On the settled "Heute" on a phone, the anniversaries tile covers neither the further tasks nor the later line, and they
 * are hit. The further tasks scroll as one list (SG-LIST-01, issue 1854): no pager stands below them.
 */
async function expectNoCover(page: Page, size: string): Promise<void> {
  const tile = await boxOf(anniversariesTile(page));
  const later = page.getByText("3 Termine später", { exact: true });
  const parts: Record<string, Locator> = {
    "the further tasks": page.getByRole("list", { name: "Weitere Aufgaben" }),
    "the later line": later,
  };
  for (const [name, part] of Object.entries(parts)) {
    expect(
      sharePoint(await boxOf(part), tile),
      `${size}: the anniversaries tile covers ${name}`,
    ).toBe(false);
  }
  expect(await hitsItself(later), `${size}: another element is hit at the later line`).toBe(true);
}

test.describe("US-QS-18 Heute at 360 px", () => {
  test("US-QS-18: Heute at 360 px: the anniversaries tile covers neither the further tasks nor the later line (issue 1662)", async ({
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
    await settleOverview(page);
    await expectNoCover(page, "360x640 at 200 %");
    // The content is taller than the window and scrolls inside the frame; it does not collapse under the tile.
    expect(
      await page.locator("[data-fit-fill]").evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
  });
});

test.describe("US-QS-14 Heute taller than the window", () => {
  test("US-QS-14: Heute taller than the window: scrolled to the end, the frame and the last further task end above the bottom bar (issue 1835)", async ({
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
    await settleOverview(page);
    const frame = page.locator("[data-fit-fill]");
    expect(await frame.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await frame.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    // The scrolling frame itself ends at the top of the bar, so its last line (its own bottom padding included) is
    // never under the bar, whatever the content; before the fix it reached 8 px (0.5 rem) under it.
    const box = await boxOf(frame);
    const bar = await boxOf(page.locator("nav[data-bottom-bar]"));
    expect(
      box.y + box.height,
      "the bottom of the scrolling frame against the top of the bar",
    ).toBeLessThanOrEqual(bar.y + 0.5);
    const list = page.getByRole("list", { name: "Weitere Aufgaben" });
    await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    const last = await boxOf(list.getByRole("listitem").last());
    expect(
      last.y + last.height,
      "the bottom of the last further task against the top of the bar",
    ).toBeLessThanOrEqual(bar.y);
  });
});
