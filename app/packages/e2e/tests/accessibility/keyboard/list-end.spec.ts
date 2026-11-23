import type { Locator, Page } from "@playwright/test";
import {
  chooseSpecies,
  expect,
  proposeSpecies,
  signIn,
  test,
  uniqueLatin,
} from "../../../support/fixtures";
import { tabTo } from "../../../support/keyboard";

// US-QS-15 (SG-LIST-01, SG-LIST-02, SG-NAV-02, issue 2419): the end of a long list on a phone, against the real API. The
// Sammlung of five plants is read in parts of two (the test rewrites `limit`; the server default is 100 plants), and the
// second part fails once: the list keeps its two plants, says what failed, and "Erneut versuchen" loads the rest. The last
// row stays above the bottom bar when the keyboard reaches it, and an old address with a position loses it.

const PLANTS = 5;
const PART = "2";
const PHONE = { width: 360, height: 640 } as const;

/** The plants of the Sammlung: the list of the page, in a column on a phone. */
const plantList = (page: Page) => page.getByRole("list", { name: "Pflanzen" });
/** The entries of the list: rows that are no loader, retry or end row. */
const entries = (page: Page) =>
  plantList(page).locator("li:not([data-list-end]):not([aria-hidden])");

/** Makes the plants one species at a time: the first proposes the species, the others choose it; each has its own marker. */
async function makePlants(page: Page): Promise<void> {
  const latin = uniqueLatin("Echeveria");
  for (let n = 1; n <= PLANTS; n++) {
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
