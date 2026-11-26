import type { Locator, Page } from "@playwright/test";
import {
  chooseSpecies,
  expect,
  proposeSpecies,
  signIn,
  test,
  uniqueLatin,
} from "../../../support/fixtures";
import { tabTo } from "./keyboard";

// US-QS-15 (SG-LIST-01, SG-LIST-02, SG-NAV-02, issue 2419): the end of a long list on a phone, against the real API. The
// Sammlung of five plants is read in parts of two (the test rewrites `limit`; the server default is 100 plants), and the
// second part fails once: the list keeps its two plants, says what failed, and "Erneut versuchen" loads the rest. The last
// row stays above the bottom bar when the keyboard reaches it, and an old address with a position loses it.

const PLANTS = 5;
const MANY = 8;
const PART = "2";
const PHONE = { width: 360, height: 640 } as const;

/** The plants of the Sammlung: the list of the page, in a column on a phone. */
const plantList = (page: Page) => page.getByRole("list", { name: "Pflanzen" });
/** The entries of the list: rows that are no loader, retry or end row. */
const entries = (page: Page) =>
  plantList(page).locator("li:not([data-list-end]):not([aria-hidden])");

/** Makes the plants one species at a time: the first proposes the species, the others choose it; each has its own marker. */
async function makePlants(page: Page, count = PLANTS): Promise<void> {
  const latin = uniqueLatin("Echeveria");
  for (let n = 1; n <= count; n++) {
    if (n === 1) await proposeSpecies(page, latin);
    else await chooseSpecies(page, latin);
    const form = page.getByRole("form", { name: "Pflanze anlegen" });
    await form.getByLabel(/^Kennzeichen/).fill(`Nr. ${n}`);
    await form.getByRole("button", { name: "Pflanze anlegen" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sammlung" })).toBeVisible();
  }
}

/** Reads the cards in parts of `PART` plants; the next part after the first fails once while `fail.next` is set. */
async function readInParts(page: Page): Promise<{ next: boolean }> {
  const fail = { next: false };
  await page.route(/\/specimens\/cards\?/, async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("limit", PART);
    if (fail.next && url.searchParams.has("after")) {
      fail.next = false;
      await route.abort("failed");
      return;
    }
    await route.continue({ url: url.toString() });
  });
  return fail;
}

/** The bottom of an element, in the window. */
async function bottomOf(target: Locator): Promise<number> {
  const box = await target.boundingBox();
  if (!box) throw new Error(`no box: ${target.toString()}`);
  return box.y + box.height;
}

test.describe("US-QS-15 the end of a list on a phone", () => {
  test("US-QS-15 · SG-LIST-01 a failed part shows the retry row, the retry loads the rest, the last row stays above the bar, an old address loses its position (rows 9 to 12, 28)", async ({
    page,
    account,
  }, info) => {
    test.skip(info.project.name !== "mobil", "the scrolling list is the phone view (below 768 px)");
    test.setTimeout(240_000);
    await page.setViewportSize(PHONE);
    await signIn(page, account);
    await makePlants(page);
    const fail = await readInParts(page);
    fail.next = true;
    await page.getByRole("link", { name: "Sammlung", exact: true }).click();
    await page.reload();

    // The second part failed: the two plants stay, the row says what failed, and no button loads more by hand.
    const alert = page
      .getByRole("alert")
      .filter({ hasText: "Der Rest konnte nicht geladen werden." });
    await expect(alert).toBeVisible();
    await expect(entries(page)).toHaveCount(Number(PART));
    const retry = plantList(page).getByRole("button", { name: "Erneut versuchen" });
    await expect(retry).toBeVisible();
    await expect(page.getByRole("button", { name: /mehr laden/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Weiter|Zurück)$/ })).toHaveCount(0);
    expect(new URL(page.url()).search, "the address holds no position").not.toMatch(/from|page/);

    // The retry loads the rest of the list: all plants, no retry row, and the end of the list says how many there were.
    await retry.click();
    await expect(entries(page)).toHaveCount(PLANTS);
    await expect(alert).toBeHidden();
    const last = entries(page).last();

    // The keyboard reaches the last row and its control ends above the bottom bar; scrolled to the end, the row does too
    // (SG-LIST-02, 2.4.11). The row is measured at the end, not at the focus: a focus clears the control, not the border.
    const control = last.locator("a[href], button").first();
    await tabTo(page, control);
    const bar = page.getByRole("navigation", { name: "Navigation unten" });
    const barTop = (await bar.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    expect(
      await bottomOf(control),
      "the focused control is behind the bottom bar",
    ).toBeLessThanOrEqual(barTop + 0.5);
    await plantList(page).hover();
    await page.mouse.wheel(0, 4000);
    await expect
      .poll(() => bottomOf(last), { message: "the last row is behind the bottom bar" })
      .toBeLessThanOrEqual(barTop + 0.5);

    // An old address with a position is stripped with no new history entry: Back leaves for the page before it.
    const before = page.url();
    await page.goto(`${new URL(before).pathname}?from=24&page=3&x=1`);
    await expect(plantList(page)).toBeVisible();
    await expect.poll(() => new URL(page.url()).search).toBe("?x=1");
    await page.goBack();
    await expect(page).toHaveURL(before);
  });
});

test.describe("US-QS-15 the list of a page scrolls in its own box", () => {
  test("US-QS-15 · SG-LIST-01 · SG-LIST-02 · SG-NAV-02 only the list of the Sammlung scrolls, its end says how many there were above the bar, and Back keeps the place of the list without a position in the address (rows 10, 12, 28)", async ({
    page,
    account,
  }, info) => {
    test.skip(
      info.project.name !== "mobil",
      "one phone size; the tablet widths run in the one-screen gate",
    );
    test.setTimeout(240_000);
    await page.setViewportSize(PHONE);
    await signIn(page, account);
    // The last plant leaves for the Sammlung: no second visit to it. A link to the page that is shown is a new history entry, and
    // the scroll below could come before the place of that entry is kept: ScrollMemory keeps the places by entry (issue 2535).
    await makePlants(page, MANY);
    await expect(entries(page)).toHaveCount(MANY);

    // The list is bounded by the frame: it scrolls in its own box, the frame around it and the page do not.
    const box = plantList(page);
    const heights = () =>
      box.evaluate((list) => {
        const fill = document.querySelector<HTMLElement>("main > div > [data-fit-fill]");
        return {
          list: list.scrollHeight - list.clientHeight,
          fill: fill ? fill.scrollHeight - fill.clientHeight : 0,
          page: document.documentElement.scrollHeight - window.innerHeight,
        };
      });
    await expect
      .poll(async () => (await heights()).list, { message: "the list does not scroll" })
      .toBeGreaterThan(0);
    expect((await heights()).fill, "the frame around the list scrolls").toBeLessThanOrEqual(1);
    expect((await heights()).page, "the page scrolls").toBeLessThanOrEqual(1);

    // At its end the list says how many plants there were, and the last row ends above the bottom bar. The marker comes after
    // a settle and adds its row, so the list is scrolled to its end again until the marker stands above the bar.
    const marker = page.getByText(`Das waren alle ${MANY}`);
    const bar = page.getByRole("navigation", { name: "Navigation unten" });
    const barTop = (await bar.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    await expect
      .poll(
        async () => {
          await box.evaluate((list) => void (list.scrollTop = list.scrollHeight));
          return (await marker.isVisible()) ? await bottomOf(marker) : Number.POSITIVE_INFINITY;
        },
        { message: "the end marker is missing or behind the bottom bar" },
      )
      .toBeLessThanOrEqual(barTop + 0.5);

    // Another destination and Back: the list stands where it was, and the address holds no position. The Sammlung stays
    // mounted behind the other destination, so this does not tell the restore of `ScrollMemory` from the kept list; the
    // restore of a list that mounts again is pinned by the unit test of `ScrollMemory` (US-QS-15, SG-NAV-02).
    const place = await box.evaluate((list) => (list.scrollTop = Math.floor(list.scrollTop / 2)));
    expect(place).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    await page.getByRole("link", { name: "Heute", exact: true }).click();
    await expect(page).toHaveURL(/\/today/);
    // Heute is on the screen before Back: the address changes at once, its first load (a lazy area) takes a moment (issue 2535).
    await expect(page.getByRole("heading", { level: 1, name: "Heute" })).toBeVisible();
    await page.goBack();
    await expect(plantList(page)).toBeVisible();
    await expect
      .poll(() => plantList(page).evaluate((list) => list.scrollTop), {
        message: "Back does not bring the list back to its place",
      })
      .toBeGreaterThan(place - 2);
    expect(new URL(page.url()).search, "the address holds a position").not.toMatch(/from|page/);
  });
});
