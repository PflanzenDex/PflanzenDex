import type { Locator, Page, TestInfo } from "@playwright/test";
import type { TestAccount } from "../../../support/account";
import { openView, signInToApp } from "../../../support/display/display";
import { expect, test } from "../../../support/fixtures";

// US-QS-15 (SG-LIST-11, issue 2419): the letter strip of the Pokédex on a phone, in the real browser. The caught species are a
// fixture of the route `/pokedex/ownership` (130 species: the layout depends on their number and names only, so it is the
// same on every run); every other read and every write goes to the real API. The strip stands beside the list, a drag on it
// jumps the list to the first entry of the letter under the finger, the keyboard does the same with one tab stop, and the
// last row ends above the bottom bar.

const API = `http://localhost:${process.env["E2E_API_PORT"] ?? "3000"}`;
const WEB = `http://localhost:${process.env["E2E_WEB_PORT"] ?? "5173"}`;
const PHONE = { width: 360, height: 640 } as const;
const LETTERS = "ABCDEFGHIJKLM";
const PER_LETTER = 10;
/** Each German name starts with its letter; the list is sorted by the name it shows. */
const nameOf = (letter: string, n: number) => `${letter}-Pflanze ${String(n).padStart(2, "0")}`;

const SPECIES = [...LETTERS].flatMap((letter) =>
  Array.from({ length: PER_LETTER }, (_, i) => ({
    species: `Planta ${letter.toLowerCase()} ${i + 1}`,
    genus: "Planta",
    chips: [],
    specimenCount: 1,
    caughtDate: { date: "2026-01-01", source: "caught_at" },
    germanName: nameOf(letter, i + 1),
    familyLatin: null,
    familyGerman: null,
    genusSpeciesCount: null,
  })),
);

/** Answers the reads of the Pokédex with the fixture; the rest of the API is the real one. */
async function fixtureOwnership(page: Page): Promise<void> {
  const answer = (path: string, body: unknown) =>
    page.route(
      (url) => url.href.startsWith(`${API}${path}`),
      (route) => {
        if (route.request().method() !== "GET") return route.continue();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": WEB },
          body: JSON.stringify(body),
        });
      },
    );
  await answer("/pokedex/ownership", { ownership: { caught: SPECIES, unidentified: [] } });
  await answer("/pokedex/seen", { seen: SPECIES.map((s) => s.species) });
}

/** The first entry of the list that is in view: the one whose bottom edge is below the top edge of the list. */
async function firstShown(list: Locator): Promise<string> {
  return list.evaluate((box) => {
    const top = box.getBoundingClientRect().top;
    const row = [...box.children].find((li) => li.getBoundingClientRect().bottom > top + 1);
    return row?.textContent ?? "";
  });
}

/**
 * The strip is as wide as a touch target and as high as the list, and the rows give up its width: it covers none and the page
 * does not scroll sideways. Returns the box of the strip.
 */
async function expectStripBesideList(page: Page, list: Locator, strip: Locator) {
  const box = await strip.boundingBox();
  const listBox = await list.boundingBox();
  if (!box || !listBox) throw new Error("no box for the strip or the list");
  expect(box.width, "the strip is narrower than 44 px").toBeGreaterThanOrEqual(43.5);
  expect(box.height, "the strip is lower than the list").toBeGreaterThanOrEqual(listBox.height - 2);
  expect(listBox.x + listBox.width, "the list reaches under the strip").toBeLessThanOrEqual(
    box.x + 0.5,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    "the page scrolls sideways",
  ).toBeLessThanOrEqual(0);
  return box;
}

/** The Pokédex of the fixture on a phone: its list and its strip, once the list is there. */
async function openPokedex(page: Page, account: TestAccount, info: TestInfo) {
  test.skip(info.project.name !== "mobil", "one phone size; the strip is the touch way to jump");
  test.setTimeout(240_000);
  await page.setViewportSize(PHONE);
  await fixtureOwnership(page);
  await signInToApp(page, account);
  await openView(page, "/collection?view=species");
  const list = page.getByRole("list", { name: "Gefangene Arten" });
  const strip = page.getByRole("slider", { name: "Springen zu Buchstabe" });
  await expect(strip).toBeVisible();
  await expect(list.locator("li").first()).toContainText("A-Pflanze 01");
  return { list, strip };
}

test.describe("US-QS-15 · SG-LIST-11 the letter strip of the Pokédex on a phone", () => {
  test("US-QS-15 · SG-LIST-11 the strip covers no row, and a drag on it jumps to the letter under the finger", async ({
    page,
    account,
  }, info) => {
    const { list, strip } = await openPokedex(page, account, info);

    const box = await expectStripBesideList(page, list, strip);

    // A finger down on F shows F large and jumps; moving to M shows M and jumps; lifting hides the letter.
    const place = (index: number) => box.y + box.height * ((index + 0.5) / 27);
    const x = box.x + box.width / 2;
    const bubble = page.locator("[data-letter-bubble]");
    await page.mouse.move(x, place(5));
    await page.mouse.down();
    await expect(bubble).toHaveText("F");
    await expect.poll(() => firstShown(list)).toContain("F-Pflanze 01");
    await page.mouse.move(x, place(12), { steps: 6 });
    await expect(bubble).toHaveText("M");
    await expect.poll(() => firstShown(list)).toContain("M-Pflanze 01");
    await page.mouse.up();
    await expect(bubble).toHaveCount(0);

    // A letter without an entry (the strip reaches Z, the species end at M) goes to the last letter that has some.
    await page.mouse.move(x, place(25));
    await page.mouse.down();
    await expect.poll(() => firstShown(list)).toContain("M-Pflanze 01");
    await page.mouse.up();
  });

  test("US-QS-15 · SG-LIST-11 the keyboard jumps with one tab stop, and the last row ends above the bottom bar", async ({
    page,
    account,
  }, info) => {
    const { list, strip } = await openPokedex(page, account, info);

    // The arrow keys step through the letters, Home goes to the first, End to the last.
    await strip.focus();
    await page.keyboard.press("Home");
    await expect.poll(() => firstShown(list)).toContain("A-Pflanze 01");
    await page.keyboard.press("ArrowDown");
    await expect(strip).toHaveAttribute("aria-valuetext", "B");
    await expect.poll(() => firstShown(list)).toContain("B-Pflanze 01");
    await page.keyboard.press("End");
    await expect(strip).toHaveAttribute("aria-valuetext", "M");

    // At the end of the list the last row ends above the bottom bar (SG-LIST-02, 2.4.11).
    const bar = page.getByRole("navigation", { name: "Navigation unten" });
    const barTop = (await bar.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    await list.hover();
    await page.mouse.wheel(0, 20_000);
    const last = list.locator("li:not([data-list-end])").last();
    await expect
      .poll(
        async () => {
          const at = await last.boundingBox();
          return at ? at.y + at.height : Number.POSITIVE_INFINITY;
        },
        { message: "the last row is behind the bottom bar" },
      )
      .toBeLessThanOrEqual(barTop + 0.5);
  });
});
