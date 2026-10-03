import { axeReport } from "../support/axe";
import { signIn, expect, test } from "../support/fixtures";
import type { Page } from "@playwright/test";

// Core flow R1: record a measurement (US-WAC-01), signed in, against the real API and database.
async function withSpecimen(page: Page, species: string): Promise<void> {
  await page.getByRole("button", { name: "Art vorschlagen" }).first().click();
  const proposal = page.getByRole("form", { name: "Art vorschlagen" });
  await proposal.getByLabel("Lateinischer Name *").fill(species);
  await proposal.getByLabel("Schwierigkeit *").selectOption({ index: 1 });
  await proposal.getByLabel("Standard-Stufe (Lichtzone) *").selectOption("3");
  await proposal.getByLabel(/Lichtbedarf/).fill("40000");
  await proposal.getByLabel("Wachstumsmaß *").selectOption("rosette_diameter");
  await proposal.getByLabel("Vergeilung-Anzeichen *").fill("Die Rosette streckt sich.");
  await proposal.getByLabel("Erfolgskriterien *").fill("Dichte, flache Rosette.");
  await proposal.getByRole("button", { name: "Vorschlag speichern" }).click();
  await page.getByRole("button", { name: "Diese Art wählen" }).click();
  await page
    .getByRole("form", { name: "Exemplar anlegen" })
    .getByRole("button", { name: "Exemplar anlegen" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Bestand" })).toBeVisible();
}

test.describe("US-WAC-01 Messung erfassen", () => {
  test("US-WAC-01 record a measurement, see it in the course and find it again after reloading", async ({
    page,
    account,
  }, info) => {
    await signIn(page, account);
    await withSpecimen(page, "Echeveria elegans");
    await page.getByRole("button", { name: /^Messen: / }).click();

    await expect(page.getByRole("heading", { level: 1, name: /^Messen: / })).toBeVisible();
    await expect(page.getByText("Was messen?")).toBeVisible();
    await expect(page.getByText("RosetteDiameter.")).toBeVisible();
    await expect(page.getByText("noch keine Messung").first()).toBeVisible();
    await expect(page.getByText("Trage oben den ersten Messwert ein.")).toBeVisible();
    await axeReport(page, info, "measure-empty");

    const form = page.getByRole("form", { name: "Messung erfassen" });
    await form.getByLabel(/^Messwert/).fill("12,5");
    await form.getByLabel("Notiz (optional)").fill("nach dem Umtopfen");
    await form.getByRole("button", { name: "Messung speichern" }).click();

    await expect(page.getByText(/^Gespeichert: 12,5 cm am \d\d\.\d\d\.\d{4}\.$/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: /^12,5 cm · / })).toBeVisible();
    await expect(page.getByText("nach dem Umtopfen")).toBeVisible();
    await axeReport(page, info, "measure-erfasst");

    // Back-filling: an earlier date and the quality "Etiolated/thin".
    await form.getByLabel(/^Messwert/).fill("10");
    await form.getByLabel("Datum").fill("2026-01-02");
    await form.getByLabel("Qualität").selectOption("etiolated");
    await form.getByRole("button", { name: "Messung speichern" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "10 cm · 02.01.2026" })).toBeVisible();
    // The last measurement is the one with the newer date, not the one entered last.
    await expect(
      page.getByText(/Letzte Messung/).locator("xpath=following-sibling::dd"),
    ).toContainText("12,5 cm");

    // Nothing is lost silently (P-10): after reloading the measurements from the database are there again.
    await page.reload();
    await page.getByRole("button", { name: "Bestand" }).click();
    await page.getByRole("button", { name: /^Messen: / }).click();
    await expect(page.getByRole("heading", { level: 3, name: "10 cm · 02.01.2026" })).toBeVisible();
  });

  test("US-WAC-01 an invalid input is rejected and writes nothing", async ({ page, account }) => {
    await signIn(page, account);
    await withSpecimen(page, "Aloe polyphylla");
    await page.getByRole("button", { name: /^Messen: / }).click();
    const form = page.getByRole("form", { name: "Messung erfassen" });
    for (const value of ["abc", "-3"]) {
      await form.getByLabel(/^Messwert/).fill(value);
      await form.getByRole("button", { name: "Messung speichern" }).click();
      await expect(page.getByRole("alert")).toContainText("Bitte gib eine Zahl ab 0 an");
    }
    await expect(page.getByText("Trage oben den ersten Messwert ein.")).toBeVisible();
  });
});
