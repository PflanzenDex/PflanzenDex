import type { Locator, Page } from "@playwright/test";
import { openView, signInToApp } from "../../../support/display/display";
import { expect, test } from "../../../support/fixtures";

// US-QS-32 (issue 2293): the layer "Neu bei Freunden" on "Heute" (/today?sheet=news) at 200 % text and on a phone at 200 % zoom
// (SG-TOUCH-01, SG-LIST-03, QG-U8). Its plant rows keep the height of their content, they never overlap, and the pager stays
// below the last row on every page. The news come from a fixture of the route `/feed/banner`: the layout depends on the plants
// and their names only, so it is the same on every run. Every other read and every write goes to the real API.

const API = `http://localhost:${process.env["E2E_API_PORT"] ?? "3000"}`;
const WEB = `http://localhost:${process.env["E2E_WEB_PORT"] ?? "5173"}`;
const LAYER = "/today?sheet=news";
/** The accessible name of the list of plants in the layer (`feed.list`). */
const LIST = "Neuigkeiten";

const CLARA = { friendId: "f1", friendName: "Clara" };
const LARS = { friendId: "f2", friendName: "Lars" };

/** One line of the banner (`BannerItem`): the plants of one species of one friend, with the names as the API gives them. */
const plant = (
  friend: { friendId: string; friendName: string },
  speciesLatin: string | null,
  speciesGerman: string | null,
  count: number,
) => ({ ...friend, speciesLatin, speciesGerman, count });

/**
 * Two friends with new plants (issue 2293): Clara's six rows (seven plants) have long names, so they wrap at 200 % text and
 * the layer pages. Lars has two rows. The first choice, Clara, is the one shown.
 */
const BANNER = {
  firstVisit: false,
  count: 9,
  asOf: "2026-11-19T10:00:00.000Z",
  items: [
    plant(CLARA, null, "Glücksfeder", 2),
    plant(CLARA, "Epipremnum aureum", "Gemeine Efeutute mit gelb marmorierten Blättern", 1),
    plant(CLARA, "Monstera deliciosa", null, 1),
    plant(CLARA, null, "Zimmerlinde", 1),
    plant(CLARA, null, "Bogenhanf", 1),
    plant(CLARA, "Sansevieria trifasciata 'Laurentii'", null, 1),
    plant(LARS, null, "Schwertfarn", 1),
    plant(LARS, null, null, 1),
  ],
  read: [],
};

/** 200 % text, set before the page loads (`addInitScript`), as the browser's own text size is: the first layout already uses it. */
async function textAt200(page: Page): Promise<void> {
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.head) return;
      const style = document.createElement("style");
      style.textContent = "html { font-size: 200% !important; }";
      document.head.append(style);
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
}

/**
 * The pager of the list: the parent of the list holds the list and its "Zurück / Seite / Weiter" bar. The page can hold another
 * "Weiter" (on a desktop, a disabled one of the first-plant flow behind the pane), so the pager is found through its list.
 */
function pagerOf(page: Page): Locator {
  return page.getByRole("list", { name: LIST }).locator("xpath=..");
}

/** The banner of the API, answered by the fixture; the rest of the API is the real one. */
async function fixtureBanner(page: Page): Promise<void> {
  await page.route(
    (url) => url.href === `${API}/feed/banner`,
    (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": WEB },
        body: JSON.stringify(BANNER),
      });
    },
  );
}

type Box = { top: number; bottom: number; height: number };

async function boxOf(locator: Locator): Promise<Box> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error("the element has no box");
  return { top: box.y, bottom: box.y + box.height, height: box.height };
}

/**
 * The page of the layer at the current window and text size: every shown row is at least as high as its link and its content
 * (a row that shrinks cuts its text, issue 2293), no row overlaps the row before it, and the pager starts below the last row.
 * Returns the bottom of the last row.
 */
async function expectRowsAndPagerApart(page: Page, size: string): Promise<number> {
  const rows = page.getByRole("list", { name: LIST }).getByRole("listitem");
  const count = await rows.count();
  expect(count, `${size}: the page shows at least one row`).toBeGreaterThan(0);
  let previousBottom = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const box = await boxOf(row);
    const link = await boxOf(row.getByRole("link"));
    const content = await row.evaluate((el) => el.scrollHeight);
    expect(
      box.height,
      `${size}: row ${i + 1} is ${box.height} px high, its link is ${link.height} px and its content ${content} px`,
    ).toBeGreaterThanOrEqual(Math.max(link.height, content) - 1);
    expect(
      box.top,
      `${size}: row ${i + 1} starts at ${box.top} px, above the row before it, which ends at ${previousBottom} px`,
    ).toBeGreaterThanOrEqual(previousBottom - 0.5);
    previousBottom = box.bottom;
  }
  const status = await boxOf(
    pagerOf(page)
      .getByRole("status")
      .filter({ hasText: /^Seite \d+ von \d+$/ }),
  );
  const next = await boxOf(pagerOf(page).getByRole("button", { name: "Weiter", exact: true }));
  expect(
    Math.min(status.top, next.top),
    `${size}: the pager starts at ${Math.min(status.top, next.top)} px, above the last row's bottom ${previousBottom} px`,
  ).toBeGreaterThanOrEqual(previousBottom - 0.5);
  return previousBottom;
}

/**
 * Every page of the layer, one after the other with "Weiter" (the pager shows: the list pages). A page of the rows is
 * measured the same way, so a page that squeezes its rows is found too (issue 2293).
 */
async function expectEveryPageApart(page: Page, size: string): Promise<number> {
  const status = pagerOf(page).getByRole("status");
  const next = pagerOf(page).getByRole("button", { name: "Weiter", exact: true });
  await expect(status, `${size}: the list pages, so the pager shows`).toBeVisible();
  const total = Number((await status.textContent())?.match(/von (\d+)/)?.[1] ?? "0");
  expect(total, `${size}: more than one page`).toBeGreaterThan(1);
  for (let number = 1; number <= total; number++) {
    await expect(status).toHaveText(`Seite ${number} von ${total}`);
    await expectRowsAndPagerApart(page, `${size}, page ${number} of ${total}`);
    if (number < total) await next.click();
  }
  return total;
}

/** The phone sizes of the layer (issue 2293): the 206 px layout width of a phone at 200 % zoom, and two sizes at 200 % text. */
const PHONE_SIZES = [
  { width: 206, height: 380, text200: false, label: "206x380 at 100 % (a phone at 200 % zoom)" },
  { width: 180, height: 400, text200: true, label: "180x400 at 200 % text" },
  { width: 360, height: 640, text200: true, label: "360x640 at 200 % text" },
] as const;

test.describe("US-QS-32 the layer Neu bei Freunden on Heute: rows keep their height, the pager is below them (issue 2293)", () => {
  for (const size of PHONE_SIZES) {
    test(`US-QS-32 the layer on a phone at ${size.label}: every row keeps its height and the pager stays below the rows on every page (issue 2293)`, async ({
      page,
      account,
    }, info) => {
      test.skip(
        info.project.name !== "mobil",
        "a phone width: from 1024 px the layer is a pane, the desktop project checks that",
      );
      await fixtureBanner(page);
      await page.setViewportSize({ width: size.width, height: size.height });
      await signInToApp(page, account);
      if (size.text200) await textAt200(page);
      await openView(page, LAYER);
      await expectEveryPageApart(page, size.label);
    });
  }

  test("US-QS-32 the layer as a pane from 1024 px at 200 % text: every row keeps its height and the pager stays below the rows (issue 2293)", async ({
    page,
    account,
  }, info) => {
    test.skip(
      info.project.name !== "desktop",
      "the pane of a layer from 1024 px: the desktop project checks it, the phone project the sheet",
    );
    await fixtureBanner(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInToApp(page, account);
    await textAt200(page);
    await openView(page, LAYER);
    await expectEveryPageApart(page, "1280x800 pane at 200 %");
  });
});
