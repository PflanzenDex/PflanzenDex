import { randomInt } from "node:crypto";
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { createTestAccount, type TestAccount } from "./account";

export { expect };

export async function signIn(page: Page, account: TestAccount): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.locator("#username").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.locator("#kc-login").click();
  // "/" shows the skeleton of Heute (with its heading) until the redirect to "Heute" runs: a click before it is overridden (issue 2535).
  await expect(page).toHaveURL(/\/today/);
  // The brand leaves the top bar while a page claims it (US-QS-32): the main region and the page's heading stand on every width.
  await expect(page.locator("#inhalt")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

/** Login, then open the management of locations and light zones (below the plants of the Sammlung, US-QS-14). */
export async function signInAtLight(page: Page, account: TestAccount): Promise<void> {
  await signIn(page, account);
  await openLocations(page);
  await expect(
    page.getByRole("heading", { level: 1, name: /Standorte und Lichtzonen/ }),
  ).toBeVisible();
}

// Every test gets its own account: tenant isolation (P-04) keeps tests independent of each other.
export const test = base.extend<{ account: TestAccount }>({
  // eslint-disable-next-line no-empty-pattern
  account: async ({}, use) => {
    await use(await createTestAccount());
  },
});

/** From any signed-in view: the Sammlung, the layer "Ansicht", then "Standorte und Lichtzonen verwalten" (US-QS-19). */
/**
 * On a phone one list shows at a time (US-QS-19): the segment "Standorte (n)" is chosen when it is there. The lists render
 * with the data, so the check waits for the segment (phone) or the list heading (desktop, where the segment is hidden):
 * a check that ran before the data arrived saw no segment and left the zones on screen.
 */
export async function showLocations(page: Page): Promise<void> {
  const segment = page.getByRole("button", { name: /^Standorte \(\d+\)$/ });
  const heading = page.getByRole("heading", { level: 2, name: "Standorte", exact: true });
  await expect(segment.or(heading)).toBeVisible();
  if (await segment.isVisible()) await segment.click();
}

/**
 * The result of a write that shows on the same screen is only announced (SG-FEED-01, US-QS-32): the shared polite live
 * region holds its text and no toast opens. The test reads the result there.
 */
export async function expectAnnounced(page: Page, text: string | RegExp): Promise<void> {
  await expect(
    page.locator('[aria-live="polite"]').filter({ hasText: text }).first(),
  ).toBeAttached();
}

/** The "+" of the locations: opens the create layer of a location (US-QS-19). */
export async function addLocation(page: Page): Promise<void> {
  await showLocations(page);
  await page.getByRole("button", { name: "Neuer Standort" }).click();
}

/**
 * A row of the lists of light zones and locations (US-LIC-05, US-QS-19): a button named by its title and facts ("Zone 2
 * bis 15.000 Lux"). It has no heading; choosing it opens the layer of the entry. Titles here are unique on the page.
 */
export function listRow(page: Page, title: string): Locator {
  return page.getByRole("button", { name: title });
}

/**
 * A change that stays in its place for the undo window (SG-FEED-03, US-QS-32): the result and "Rückgängig" stand where the
 * control was. The row leaves when its 8 s end; the check waits for that, no clock is faked.
 */
export async function expectUndoInPlace(page: Page, result: string, undo: RegExp): Promise<void> {
  const button = page.getByRole("button", { name: undo });
  await expect(button).toBeVisible();
  await expect(page.getByText(`${result} · Rückgängig`, { exact: true })).toBeVisible();
  await expect(button).toBeHidden({ timeout: 12_000 });
}

export async function openLocations(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Sammlung", exact: true }).click();
  await page.getByRole("button", { name: "Ansicht" }).click();
  await page.getByRole("button", { name: "Standorte und Lichtzonen verwalten" }).click();
}

/** The first plant of the Sammlung as a layer with tabs; the overview holds "Messen" (US-QS-19, US-QS-23). */
export async function openFirstPlant(page: Page): Promise<void> {
  await page.getByRole("list", { name: "Pflanzen" }).getByRole("button").first().click();
  await expect(page.getByRole("tab", { name: "Überblick", selected: true })).toBeVisible();
}

/** Adds a location in "Standorte und Lichtzonen verwalten" (US-LIC-05), without a light zone. */
export async function createLocation(page: Page, name: string): Promise<void> {
  await openLocations(page);
  await addLocation(page);
  const form = page.getByRole("form", { name: "Standort anlegen" });
  await form.getByLabel("Name").fill(name);
  await page.locator("[data-form-bar]").getByText("Standort anlegen").click();
  await expect(listRow(page, name)).toBeVisible();
}

/** The plant whose name contains `name` (a species, or a species with its marker) as its layer with tabs (US-QS-23). */
export async function openPlant(page: Page, name: string): Promise<void> {
  await page.getByRole("link", { name: "Sammlung", exact: true }).click();
  await page.getByRole("list", { name: "Pflanzen" }).getByRole("button", { name }).click();
  await expect(page.getByRole("tab", { name: "Überblick", selected: true })).toBeVisible();
}

/**
 * A layer by its name: the bottom sheet or the dialog (below 1024 px), the pane (from 1024 px). The actions of a form are in
 * the bar of the layer, outside the `<form>` element on a phone (US-QS-32, SG-SHEET-04), so they are found in the layer.
 */
export function layerOf(page: Page, name: string): Locator {
  return page
    .getByRole("dialog", { name, exact: true })
    .or(page.getByRole("complementary", { name, exact: true }));
}

/**
 * Proposes a species in the catalog and chooses it, as measure.spec does. The dormancy period is optional and given as
 * month-day, both or none (US-QS-24).
 */
export async function proposeSpecies(
  page: Page,
  latinName: string,
  dormancy?: { from: string; until: string },
): Promise<void> {
  // The catalog is the mode "Katalog" of Entdecken (US-QS-14).
  await page.getByRole("link", { name: "Entdecken", exact: true }).click();
  await page.getByRole("button", { name: "Katalog" }).click();
  await page.getByRole("button", { name: "Art vorschlagen" }).first().click();
  // The fields and the bar of the form are in the layer; on a phone the bar is outside the form element (US-QS-32).
  const proposal = layerOf(page, "Art vorschlagen");
  await proposal.getByLabel("Lateinischer Name").fill(latinName);
  await proposal.getByLabel("Wachstumsmaß").selectOption("rosette_diameter");
  await proposal.getByRole("button", { name: "Weiter" }).click();
  await proposal.getByLabel("Vergeilungsanzeichen").fill("Die Rosette streckt sich.");
  await proposal.getByLabel("Erfolgskriterien").fill("Dichte, flache Rosette.");
  if (dormancy) {
    await proposal.getByText("Mehr Angaben", { exact: true }).click();
    await proposal.getByLabel("Ruhephase von (Monat-Tag)").fill(dormancy.from);
    await proposal.getByLabel("Ruhephase bis (Monat-Tag)").fill(dormancy.until);
  }
  await proposal.getByRole("button", { name: "Vorschlag sichern" }).click();
  await page.getByRole("button", { name: "Diese Art wählen" }).click();
}

/** Chooses a species the catalog already holds, found by its Latin name in the search (the species profile). */
export async function chooseSpecies(page: Page, latinName: string): Promise<void> {
  await page.getByRole("link", { name: "Entdecken", exact: true }).click();
  await page.getByRole("button", { name: "Katalog" }).click();
  await page.getByLabel("Lateinischer oder deutscher Name").fill(latinName);
  await page.getByRole("button", { name: latinName }).click();
  await page.getByRole("button", { name: "Diese Art wählen" }).click();
}

/** Creates the plant of the chosen species ("Pflanze anlegen"); the marker and the cutting are optional. */
export async function createPlant(
  page: Page,
  options: { location: string; marker?: string; cutting?: boolean },
): Promise<void> {
  const form = page.getByRole("form", { name: "Pflanze anlegen" });
  await form.getByLabel("Standort", { exact: true }).selectOption({ label: options.location });
  if (options.marker) await form.getByLabel(/^Kennzeichen/).fill(options.marker);
  if (options.cutting) await form.getByLabel("Das ist ein Steckling").check();
  await form.getByRole("button", { name: "Pflanze anlegen" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sammlung" })).toBeVisible();
}

/** The local calendar date `YYYY-MM-DD` of a zone now, as a UTC midnight date: the day the server computes as "today" (NFR-08). */
export function localToday(zone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
}

/** `MM-DD` of the calendar day `offset` days from `base` (UTC arithmetic on a calendar date, no time zone shift). */
export function monthDay(base: Date, offset: number): string {
  const day = new Date(base.getTime() + offset * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
}

/** A Latin name no run has used: the catalog is shared, and a name is two words of letters (DM-BES-01). */
export function uniqueLatin(genus: string): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const epithet = Array.from({ length: 10 }, () => letters[randomInt(letters.length)]).join("");
  return `${genus} ${epithet}`;
}
