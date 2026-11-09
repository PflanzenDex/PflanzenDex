import { axeReport } from "../support/axe";
import {
  chooseSpecies,
  createLocation,
  createPlant,
  expect,
  localToday,
  monthDay,
  openPlant,
  proposeSpecies,
  signIn,
  test,
  uniqueLatin,
} from "../support/fixtures";
import type { Page, TestInfo } from "@playwright/test";

// Care phases (US-PHA-01), signed in, against the real API and database. The browser flow creates the locations, the
// species (the dormancy period from the catalog proposal or from the keeper's care profile), the plants, a cutting and an
// archived plant in the UI, then reads the grouping "Nach Pflegephase" of the Sammlung. The phase derivation is also
// covered by `packages/api/src/care/care-phases.test.ts` against the real database.

/** The time zone of the browser (the device's; the account has none chosen): "today" is computed in it, the server too. */
const ZONE = "Europe/Berlin";

/** The own care profile of a species, opened from one of its plants: the tab "Pflege", the part "Pflegeprofil" (US-BES-09). */
async function openCareProfile(page: Page, plant: string): Promise<void> {
  await openPlant(page, plant);
  await page.getByRole("tab", { name: "Pflege" }).click();
  await page
    .getByRole("group", { name: "Teile der Pflege" })
    .getByRole("button", { name: "Pflegeprofil" })
    .click();
  await page.getByRole("button", { name: "Pflegeprofil bearbeiten" }).click();
}

/**
 * Closes the editor of a species' profile, then the plant layer it was opened from if that is still open (on a phone it
 * covers the navigation). Escape closes a layer only while the focus is inside it, and the save leaves the focus on the
 * disabled button: so the focus moves to the title of the editor first. Closing returns the focus to the opener (US-QS-23).
 */
async function closeCareProfile(page: Page, species: string): Promise<void> {
  await page.getByRole("heading", { level: 2, name: "Pflegeprofil", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: `Speichern: ${species}` })).toBeHidden();
  if (await page.getByRole("tab", { name: "Überblick" }).isVisible()) {
    await page.keyboard.press("Escape");
  }
}

/**
 * Sets the target location of the dormancy phase and, when given, the dormancy period in the editor of the care profile
 * (US-BES-09, FR-PHA-02). "Weiter" leads to the page of the dormancy period (the plant layer has "Weitere Pflanze"); the
 * save button stays below all pages.
 */
async function setProfile(
  page: Page,
  species: string,
  profile: { target: string; dormancy?: { from: string; until: string } },
): Promise<void> {
  await openCareProfile(page, species);
  await page
    .getByRole("combobox", { name: `Soll-Standort Ruhephase für „${species}“` })
    .selectOption({ label: profile.target });
  if (profile.dormancy) {
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    const { from, until } = profile.dormancy;
    const parts: [label: string, value: string][] = [
      [`Ruhephase von (Monat) für „${species}“`, from.slice(0, 2)],
      [`Ruhephase von (Tag) für „${species}“`, from.slice(3, 5)],
      [`Ruhephase bis (Monat) für „${species}“`, until.slice(0, 2)],
      [`Ruhephase bis (Tag) für „${species}“`, until.slice(3, 5)],
    ];
    for (const [label, value] of parts) {
      await page.getByRole("combobox", { name: label }).selectOption(String(Number(value)));
    }
  }
  await page.getByRole("button", { name: `Speichern: ${species}` }).click();
  await expect(page.getByText(`Pflegeprofil für „${species}“ gespeichert.`)).toBeVisible();
  await closeCareProfile(page, species);
}

/** Archives a plant from its menu "Mehr" (US-BES-07); the form asks once more, its submit is "Archivieren". */
async function archivePlant(page: Page, plant: string): Promise<void> {
  await openPlant(page, plant);
  await page.getByRole("button", { name: "Mehr" }).click();
  await page.getByRole("menuitem", { name: "Archivieren" }).click();
  const form = page.getByRole("form", { name: "Pflanze archivieren" });
  await form.getByRole("button", { name: "Archivieren" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sammlung" })).toBeVisible();
}

/** The grouping "Nach Pflegephase" of the Sammlung: the plants with a phase, by phase (US-QS-14, US-QS-19). */
async function openPhaseGrouping(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Sammlung", exact: true }).click();
  await page.getByRole("button", { name: "Ansicht" }).click();
  await page.getByRole("button", { name: "Nach Pflegephase" }).click();
}

/**
 * The grouping shows each plant with the phase of today, its target location and what the view says next. The dormancy
 * group holds two plants (not the cutting, not the archived one); the growth group holds one (US-PHA-01, P-08, P-09).
 */
async function expectPhases(
  page: Page,
  info: TestInfo,
  names: { ruhe: string; profil: string; wachs: string },
): Promise<void> {
  const { ruhe, profil, wachs } = names;
  const list = page.getByRole("list", { name: "Pflanzen mit Pflegephase" });
  const card = (name: string) =>
    page.getByRole("heading", { level: 3, name, exact: true }).locator("xpath=../..");
  await expect(page.getByRole("button", { name: /^Ruhephase \(2\)$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Wachstumsphase \(1\)$/ })).toBeVisible();
  // Dormancy today: the plant at Fensterbank stands off its target Keller; the profile species stands at it.
  await expect(card(ruhe)).toContainText("Soll-Phase heute: Ruhephase");
  await expect(card(ruhe)).toContainText(
    "Standort: Fensterbank · Soll-Standort: Keller · Weicht ab",
  );
  await expect(card(ruhe)).toContainText("Nächster Wechsel zur Wachstumsphase");
  await expect(card(profil)).toContainText("Soll-Phase heute: Ruhephase");
  await expect(card(profil)).toContainText("Standort: Keller · Soll-Standort: Keller");
  await expect(list.getByRole("heading", { level: 3 })).toHaveCount(2);
  await axeReport(page, info, "carePhases-list", { blocking: true });

  // Growth today: no target location in the profile, so it is unknown and the view says what to do (P-08, P-09).
  await page.getByRole("button", { name: /^Wachstumsphase \(1\)$/ }).click();
  await expect(list.getByRole("heading", { level: 3 })).toHaveCount(1);
  await expect(list.getByRole("heading", { level: 3, name: /Steckling/ })).toHaveCount(0);
  await expect(card(wachs)).toContainText("Soll-Phase heute: Wachstumsphase");
  await expect(card(wachs)).toContainText("Standort: Fensterbank · Soll-Standort: unbekannt");
  await expect(card(wachs)).toContainText(
    "Wähle im Pflegeprofil der Art einen Soll-Standort für die Wachstumsphase.",
  );
  await expect(card(wachs)).toContainText("Nächster Wechsel zur Ruhephase");
}

test.describe("US-PHA-01 Pflegephasen", () => {
  test("US-PHA-01 a new account sees the empty state with next action (P-09)", async ({
    page,
    account,
  }, info) => {
    await signIn(page, account);
    await openPhaseGrouping(page);
    await expect(page.getByRole("heading", { level: 2, name: "Pflegephasen" })).toBeVisible();
    await expect(
      page.getByText("Lege in der Sammlung eine Pflanze einer solchen Art an."),
    ).toBeVisible();
    await axeReport(page, info, "carePhases-empty");
  });
});

test.describe("US-PHA-01 Pflegephasen mit Pflanzen", () => {
  test.use({ timezoneId: ZONE });

  test("US-PHA-01 the phase list shows each plant with its expected phase and target location; cuttings and archived plants are not listed", async ({
    page,
    account,
  }, info) => {
    // Three species are proposed, five plants are created and two profiles are edited, all in the UI: a phone needs
    // about a minute, more than the default test timeout of the config.
    test.setTimeout(120_000);
    // The server reads the system clock, so the windows are placed around today: a period from today-3 to today+3 holds
    // today in every run; a period from today+3 to today-3 never does (it crosses the new year for most dates).
    const today = localToday(ZONE);
    const ruhe = uniqueLatin("Ruhia");
    const wachs = uniqueLatin("Wachsia");
    const profil = uniqueLatin("Profilia");
    const dormancy = { from: monthDay(today, -3), until: monthDay(today, 3) };

    await signIn(page, account);
    await createLocation(page, "Fensterbank");
    await createLocation(page, "Keller");
    await proposeSpecies(page, ruhe, dormancy);
    await createPlant(page, { location: "Fensterbank" });
    await proposeSpecies(page, wachs, { from: monthDay(today, 3), until: monthDay(today, -3) });
    await createPlant(page, { location: "Fensterbank" });
    await proposeSpecies(page, profil);
    await createPlant(page, { location: "Keller" });
    // The target location per phase is chosen in the care profile of the species (US-BES-09, FR-PHA-02).
    await setProfile(page, ruhe, { target: "Keller" });
    await setProfile(page, profil, { target: "Keller", dormancy });

    // A cutting of the growth species and a plant of the first species that is archived again: neither is listed.
    await chooseSpecies(page, wachs);
    await createPlant(page, { location: "Fensterbank", marker: "Steckling", cutting: true });
    await chooseSpecies(page, ruhe);
    await createPlant(page, { location: "Fensterbank", marker: "alt" });
    await archivePlant(page, `${ruhe} – alt`);

    await openPhaseGrouping(page);
    await expectPhases(page, info, { ruhe, profil, wachs });
  });
});
