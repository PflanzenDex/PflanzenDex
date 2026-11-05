import { axeReport } from "../support/axe";
import { openFirstPlant, signIn, expect, test } from "../support/fixtures";
import type { Page } from "@playwright/test";

// Core flow R1: record a measurement (US-WAC-01), signed in, against the real API and database.
async function withSpecimen(page: Page, species: string): Promise<void> {
  // The catalog is the mode "Katalog" of Entdecken (US-QS-14).
  await page.getByRole("link", { name: "Entdecken", exact: true }).click();
  await page.getByRole("button", { name: "Katalog" }).click();
  await page.getByRole("button", { name: "Art vorschlagen" }).first().click();
  const proposal = page.getByRole("form", { name: "Art vorschlagen" });
  // Step 1 holds the name and the growth measure (US-QS-21); the light is optional and sits behind "Mehr Angaben" (US-QS-24).
  await proposal.getByLabel("Lateinischer Name").fill(species);
  await proposal.getByLabel("Wachstumsmaß").selectOption("rosette_diameter");
  await proposal.getByRole("button", { name: "Weiter" }).click();
  await proposal.getByLabel("Vergeilung-Anzeichen").fill("Die Rosette streckt sich.");
  await proposal.getByLabel("Erfolgskriterien").fill("Dichte, flache Rosette.");
  await proposal.getByText("Mehr Angaben", { exact: true }).click();
  await proposal.getByLabel("Schwierigkeit").selectOption({ index: 1 });
  await proposal.getByLabel("Standard-Stufe (Lichtzone)").selectOption("3");
  await proposal.getByLabel(/Lichtbedarf/).fill("40000");
  await proposal.getByRole("button", { name: "Vorschlag speichern" }).click();
  await page.getByRole("button", { name: "Diese Art wählen" }).click();
  await page
    .getByRole("form", { name: "Pflanze anlegen" })
    .getByRole("button", { name: "Pflanze anlegen" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Sammlung" })).toBeVisible();
}

/** From any view: the Sammlung, then the measuring view of the first plant. */
async function measureFromCollection(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Sammlung", exact: true }).click();
  await openFirstPlant(page);
  await page.getByRole("button", { name: /^Messen: / }).click();
}

/**
 * The facts and the course of a specimen live in the layer "Verlauf" of the measure page (US-QS-15); the page keeps the
 * last measurement, the form and "Messung speichern". Escape closes the layer again.
 */
async function openCourse(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Verlauf \(\d+\)$/ }).click();
  await expect(page.getByRole("heading", { name: /^Verlauf: / })).toBeVisible();
}

/** The layer opens on "Überblick"; the rows of the measurements are its part "Messungen" (US-QS-15). */
async function openMeasurements(page: Page): Promise<void> {
  await openCourse(page);
  await page
    .getByRole("group", { name: "Teile des Verlaufs" })
    .getByRole("button", { name: "Messungen" })
    .click();
}

test.describe("US-WAC-01 Messung erfassen", () => {
  test("US-WAC-01 record a measurement, see it in the course and find it again after reloading", async ({
    page,
    account,
  }, info) => {
    await signIn(page, account);
    await withSpecimen(page, "Echeveria elegans");
    await openFirstPlant(page);
    await page.getByRole("button", { name: /^Messen: / }).click();

    await expect(page.getByRole("heading", { level: 1, name: /^Messen: / })).toBeVisible();
    await expect(page.getByText("noch keine Messung").first()).toBeVisible();
    await openCourse(page);
    await expect(page.getByText("Was messen?")).toBeVisible();
    await expect(page.getByText("Rosettendurchmesser.")).toBeVisible();
    await expect(page.getByText("Trage oben den ersten Messwert ein.")).toBeVisible();
    await axeReport(page, info, "measure-empty");
    await page.keyboard.press("Escape");

    const form = page.getByRole("form", { name: "Messung erfassen" });
    await form.getByLabel(/^Messwert/).fill("12,5");
    // The note is optional and sits behind "Mehr Angaben" (US-QS-24).
    await form.getByText("Mehr Angaben", { exact: true }).click();
    await form.getByLabel("Notiz (optional)").fill("nach dem Umtopfen");
    await page.getByRole("button", { name: "Messung speichern" }).click();

    // Value and unit are joined by a non-breaking space (US-QS-24); `\s` matches it.
    await expect(page.getByText(/^Gespeichert: 12,5\scm am \d\d\.\d\d\.\d{4}\.$/)).toBeVisible();
    await openMeasurements(page);
    await expect(page.getByRole("heading", { level: 3, name: /^12,5\scm · / })).toBeVisible();
    await expect(page.getByText("nach dem Umtopfen", { exact: true })).toBeVisible();
    await axeReport(page, info, "measure-erfasst");
    await page.keyboard.press("Escape");

    // Back-filling: an earlier date and the quality "Etiolated/thin".
    await form.getByLabel(/^Messwert/).fill("10");
    await form.getByLabel("Datum").fill("2026-01-02");
    await form.getByLabel("Qualität").selectOption("etiolated");
    await page.getByRole("button", { name: "Messung speichern" }).click();
    await openMeasurements(page);
    await expect(page.getByRole("heading", { level: 3, name: "10 cm · 02.01.2026" })).toBeVisible();
    await page.keyboard.press("Escape");
    // The last measurement is the one with the newer date, not the one entered last.
    await expect(
      page.getByText(/Letzte Messung/).locator("xpath=following-sibling::dd"),
    ).toContainText("12,5 cm");

    // Nothing is lost silently (P-10): after reloading the measurements from the database are there again.
    await page.reload();
    await measureFromCollection(page);
    await openMeasurements(page);
    await expect(page.getByRole("heading", { level: 3, name: "10 cm · 02.01.2026" })).toBeVisible();
  });

  test("US-WAC-01 an invalid input is rejected and writes nothing", async ({ page, account }) => {
    await signIn(page, account);
    await withSpecimen(page, "Aloe polyphylla");
    await openFirstPlant(page);
    await page.getByRole("button", { name: /^Messen: / }).click();
    const form = page.getByRole("form", { name: "Messung erfassen" });
    for (const value of ["abc", "-3"]) {
      await form.getByLabel(/^Messwert/).fill(value);
      await page.getByRole("button", { name: "Messung speichern" }).click();
      await expect(page.getByRole("alert")).toContainText("Bitte gib eine Zahl ab 0 an");
    }
    await openCourse(page);
    await expect(page.getByText("Trage oben den ersten Messwert ein.")).toBeVisible();
  });
});
