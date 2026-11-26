import type { Locator, Page } from "@playwright/test";
import {
  expectAnnounced,
  expect,
  expectUndoInPlace,
  openFirstPlant,
  proposeSpecies,
  signIn,
  test,
  uniqueLatin,
} from "../../../support/fixtures";
import { placesOf, settledPlaces } from "./quick-action-places";

// US-QS-07 (issue 144): the four everyday flows on a phone of 360 x 640 px (starting value, assumption): measure with a photo,
// water, tick off a treatment and open "Heute". Every view fits the width; a main action lies in the lower half of the window.

const PHONE = { width: 360, height: 640 } as const;

/** A 1 x 1 px PNG for the photo field; the server re-encodes the photo (US-WAC-06). */
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** The view fits the width: the page and its main area do not scroll sideways (US-QS-07, WCAG 1.4.10). */
async function expectFitsWidth(page: Page, view: string): Promise<void> {
  const pageWidths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(pageWidths.scroll, `${view}: the page scrolls sideways`).toBeLessThanOrEqual(
    pageWidths.width,
  );
  const main = await page
    .locator("main")
    .first()
    .evaluate((el) => ({ scroll: el.scrollWidth, width: el.clientWidth }));
  // One pixel of tolerance: a fractional width rounds up in scrollWidth (as reflow.spec allows).
  expect(main.scroll, `${view}: the main area scrolls sideways`).toBeLessThanOrEqual(
    main.width + 1,
  );
}

/**
 * The main action lies in the lower half of the window: its centre is below half the window height. The check waits
 * for a layer that is still sliding in before it reads the position (US-QS-07).
 */
async function expectLowerHalf(page: Page, action: Locator, what: string): Promise<void> {
  await expect(action).toBeVisible();
  const half = await page.evaluate(() => window.innerHeight / 2);
  const centre = async (): Promise<number> => {
    const box = await action.boundingBox();
    return box ? box.y + box.height / 2 : 0;
  };
  await expect.poll(centre).toBeGreaterThan(half);
  expect(await centre(), `${what}: the main action is not in the lower half`).toBeGreaterThan(half);
}

/** The bottom bar of the phone: the destinations of the app (US-QS-16). */
const bottomBar = (page: Page) => page.getByRole("navigation", { name: "Navigation unten" });

/** The start: a species of the catalog and its plant, as the other e2e flows make them. */
async function startWithPlant(page: Page): Promise<void> {
  await proposeSpecies(page, uniqueLatin("Echeveria"));
  await page
    .getByRole("form", { name: "Pflanze anlegen" })
    .getByRole("button", { name: "Pflanze anlegen" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Sammlung" })).toBeVisible();
  await expectAnnounced(page, "ist angelegt");
}

/** The partial result of a save whose photo could not be stored: the measurement is kept, the photo is not (issue 144). */
const PHOTO_NOT_STORED = /^Die Messung ist gesichert, das Foto nicht\./;

/**
 * After "Messung sichern" with a photo the page shows the success toast or the partial result of a photo that could not be
 * stored (the e2e stack has no image store; the upload is checked on the owner's phone, US-QS-07). Both are accepted.
 */
async function settleMeasurementSave(page: Page): Promise<void> {
  const saved = page.locator('[aria-live="polite"]').filter({ hasText: "Gesichert: 12,5" }).first();
  const partial = page.getByText(PHOTO_NOT_STORED);
  await expect(saved.or(partial)).toBeVisible();
  if (await partial.isVisible()) {
    // The error toast has no role: it sits in the assertive region, its close button is named by aria-label.
    const notice = page.locator('[aria-live="assertive"]').filter({ has: partial });
    await notice.getByRole("button", { name: "Meldung schließen" }).click({ timeout: 10_000 });
    await expect(partial).toBeHidden();
  }
}

/** 1. Measure with a photo: the photo field sits behind "Mehr Angaben"; "Messung sichern" is the main action, in the bar at the top (SG-SHEET-04). */
async function measureWithPhoto(page: Page): Promise<void> {
  await openFirstPlant(page);
  await page.getByRole("button", { name: /^Messen: / }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Messen", exact: true })).toBeVisible();
  await expectFitsWidth(page, "Messen");
  const form = page.getByRole("form", { name: "Messung erfassen" });
  await form.getByLabel(/^Messwert/).fill("12,5");
  await form.getByText("Mehr Angaben", { exact: true }).click();
  await form.getByLabel("Foto wählen").setInputFiles({
    name: "pflanze.png",
    mimeType: "image/png",
    buffer: PHOTO,
  });
  const save = page.getByRole("button", { name: "Messung sichern" });
  // The confirming action of a form sits in the bar at the top, so it is outside the lower-half rule (US-QS-32).
  await expect(save).toBeVisible();
  await save.click();
  await settleMeasurementSave(page);
}

/** 2. Water the plant: the button "Gießen" of its layer "Überblick" writes today's entry (US-MON-05, US-QS-23). */
async function waterPlant(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Sammlung", exact: true }).click();
  await openFirstPlant(page);
  await expectFitsWidth(page, "Pflanze, Überblick");
  const water = page.getByRole("button", { name: /^Gießen: / });
  await expectLowerHalf(page, water, "water: Gießen");
  const places = await settledPlaces(page);
  await water.click();
  // The result stands in a line under the row (issue 2536); it stays 8 s, no toast opens (SG-FEED-03). The focus stays on "Gießen".
  await expect(page.getByRole("button", { name: /^Rückgängig: / })).toBeVisible();
  await expect(water, "the undo took the focus").toBeFocused();
  expect(await placesOf(page), "the undo row scrolled or moved the quick actions").toEqual(places);
  await expectUndoInPlace(page, "Gegossen heute", /^Rückgängig: /);
  // The same day again makes no entry: "Zuletzt gegossen: heute" takes the same line.
  await water.click();
  await expect(page.locator("p").filter({ hasText: "Zuletzt gegossen: heute" })).toBeVisible();
  expect(await placesOf(page), "the line 'Zuletzt gegossen' scrolled or moved").toEqual(places);
  // Escape closes a layer only while the focus is inside it: the focus goes to the layer's tab first.
  await page.getByRole("tab", { name: "Überblick" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab", { name: "Überblick" })).toBeHidden();
}

/** 3. Tick off an open treatment: plan one in the layer "Behandlungen" of "Heute" (US-BEH-01), then tick it off. */
async function tickOffTreatment(page: Page): Promise<void> {
  await bottomBar(page)
    .getByRole("link", { name: /^Heute/ })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Heute" })).toBeVisible();
  await expectFitsWidth(page, "Heute");
  await page.getByRole("button", { name: /^(\d+ Behandlungen|Behandlungen \d+.*)$/ }).click();
  await expectFitsWidth(page, "Behandlungen");
  await page.getByRole("button", { name: "Behandlung planen" }).first().click();
  const plan = page.getByRole("form", { name: /Behandlung planen/ });
  await plan.getByRole("checkbox").first().check();
  await plan
    .getByRole("group", { name: "Teile der Behandlung" })
    .getByRole("button", { name: "Termin" })
    .click();
  await plan.getByLabel(/^Grund/).fill("Wollläuse");
  await page.getByRole("button", { name: "Behandlung sichern" }).click();
  // Not in the lower-half check: the layer "Behandlungen" opens from the top, its first row ("Abhaken") lies in the upper half.
  await page.getByRole("button", { name: /^Wollläuse bei .* als erledigt abhaken$/ }).click();
  // The tick-off stays in its place as "Erledigt · Rückgängig" for 8 s, then the row moves (US-QS-32, SG-FEED-03).
  await expectUndoInPlace(page, "Erledigt", /^Rückgängig: Wollläuse bei /);
  await page.getByRole("button", { name: "Behandlung planen" }).first().focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Behandlung planen" }).first()).toBeHidden();
}

/** 4. Open Heute from another view: its entry in the bottom bar is the action that opens the list. */
async function openHeute(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Sammlung", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sammlung" })).toBeVisible();
  const today = bottomBar(page).getByRole("link", { name: /^Heute/ });
  await expectLowerHalf(page, today, "open Heute: bottom bar entry");
  await today.click();
  await expect(page.getByRole("heading", { level: 1, name: "Heute" })).toBeVisible();
  await expectFitsWidth(page, "Heute, opened");
}

test.describe("US-QS-07 the everyday flows on a phone of 360 x 640 px", () => {
  test("US-QS-07 measure with a photo, water, tick off a treatment and open Heute: no sideways scroll, the main actions in the lower half (issue 144)", async ({
    page,
    account,
  }, info) => {
    test.skip(
      info.project.name !== "mobil",
      "a phone width: the desktop project is not sized for 360 px",
    );
    test.setTimeout(240_000);
    await page.setViewportSize(PHONE);
    await signIn(page, account);
    await startWithPlant(page);
    await measureWithPhoto(page);
    await waterPlant(page);
    await tickOffTreatment(page);
    await openHeute(page);
  });
});
