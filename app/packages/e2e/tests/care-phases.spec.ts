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
  await expect(page.getByRole("button", { name: `Sichern: ${species}` })).toBeHidden();
  if (await page.getByRole("tab", { name: "Überblick" }).isVisible()) {
    await page.keyboard.press("Escape");
    // The close commits late (the address changes in a transition): the next step waits until the layer is gone (issue 1791).
    await expect(page.getByRole("tab", { name: "Überblick" })).toBeHidden();
  }
}

/**
 * Sets the target location of the dormancy phase and, when given, the dormancy period in the editor of the care profile
 * (US-BES-09, FR-PHA-02). The fields are one scrolling list in the layer, with no pages (US-QS-15, issue 2418); the save is in its bar.
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
  await page.getByRole("button", { name: `Sichern: ${species}` }).click();
  await expect(page.getByText(`Pflegeprofil für „${species}“ gesichert.`)).toBeVisible();
  await closeCareProfile(page, species);
}

/** Archives a plant from its menu "Mehr" (US-BES-07); the form asks once more, its submit is "Archivieren". */
async function archivePlant(page: Page, plant: string): Promise<void> {
  await openPlant(page, plant);
  await page.getByRole("button", { name: "Mehr" }).click();
  await page.getByRole("menuitem", { name: "Pflanze archivieren" }).click();
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
 * The grouping shows each plant with the phase of today, its target location and what the view says next: the groups are
 * sections of one list with a count each, and the chips only jump to them (US-QS-15, SG-LIST-06; US-PHA-01, P-08, P-09).
 */
async function expectPhases(
  page: Page,
  info: TestInfo,
  names: { ruhe: string; profil: string; wachs: string },
): Promise<void> {
  const { ruhe, profil, wachs } = names;
  // The "Umstellen: <name>" button of a plant carries the same name: the row is the button without that label.
  const row = (name: string) =>
    page.getByRole("button", { name }).and(page.locator(":not([aria-label^='Umstellen'])"));
  const [DORMANCY, GROWTH] = ["Ruhephase · 2 Pflanzen", "Wachstumsphase · 1 Pflanze"] as const;
  const dormancy = page.getByRole("region", { name: DORMANCY, exact: true });
  const growth = page.getByRole("region", { name: GROWTH, exact: true });
  const chips = page.getByRole("group", { name: "Zur Pflegephase springen" }); // from 768 px, else a select
  const select = page.getByRole("combobox", { name: "Zur Pflegephase springen" });
  await expect(chips.or(select)).toBeVisible();
  const onPhone = await select.isVisible();
  const labels = ["Zur Pflegephase springen", DORMANCY, GROWTH];
  if (onPhone) await expect(select.getByRole("option")).toHaveText(labels);
  else
    for (const group of labels.slice(1))
      await expect(chips.getByRole("button", { name: group, exact: true })).toBeVisible();
  // Dormancy today: the plant at Fensterbank stands off its target Keller, so the row carries the one action that moves it
  // (US-QS-32, SG-LIST-03). The row is named by the plant's title and names the target it has to move to.
  await expect(row(ruhe)).toContainText("Soll-Standort: Keller");
  await expect(row(ruhe)).not.toContainText("Soll-Phase");
  await expect(page.getByRole("button", { name: `Umstellen: ${ruhe}` })).toBeVisible();
  // The plant at its target shows no place (owner answer Q-82).
  await expect(row(profil)).toContainText("Nächster Wechsel zur Wachstumsphase:");
  await expect(row(profil)).not.toContainText("Standort");
  await expect(dormancy.getByRole("listitem")).toHaveCount(2);
  await axeReport(page, info, "carePhases-list", { blocking: true });
  // Growth today: no target location, so it is unknown and the view says what to do (P-08, P-09); the jump leads to its section.
  if (onPhone) await select.selectOption({ label: GROWTH });
  else await chips.getByRole("button", { name: GROWTH, exact: true }).click();
  await expect(growth.getByRole("heading", { level: 3 })).toBeInViewport();
  await expect(growth.getByRole("listitem")).toHaveCount(1);
  await expect(row(wachs)).toContainText("Nächster Wechsel zur Ruhephase:");
  await expect(
    growth.getByText("Wähle im Pflegeprofil der Art einen Soll-Standort für die Wachstumsphase."),
  ).toBeVisible();
}

test.describe("US-PHA-01 Pflegephasen", () => {
  test("US-PHA-01 a new account sees the empty state with next action (P-09)", async ({
    page,
    account,
  }, info) => {
    await signIn(page, account);
    await openPhaseGrouping(page);
    await expect(page.getByRole("heading", { level: 2, name: "Pflegephasen" })).toBeVisible();
    await expect(page.getByText("Noch keine Pflanze hat eine Phase.")).toBeVisible();
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
    // The row of a plant with its own name shows the name as its title and the species after it (US-QS-32, #2266).
    await archivePlant(page, `alt ${ruhe}`);

    await openPhaseGrouping(page);
    await expectPhases(page, info, { ruhe, profil, wachs });
  });
});
