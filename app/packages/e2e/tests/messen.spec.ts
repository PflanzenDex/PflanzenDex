import { axeBericht } from "../support/axe";
import { anmelden, expect, test } from "../support/fixtures";
import type { Page } from "@playwright/test";

// Kernablauf R1: eine Messung erfassen (US-WAC-01), angemeldet, gegen echte API und Datenbank.
async function mitExemplar(page: Page, art: string): Promise<void> {
  await page.getByRole("button", { name: "Art vorschlagen" }).first().click();
  const vorschlag = page.getByRole("form", { name: "Art vorschlagen" });
  await vorschlag.getByLabel("Lateinischer Name *").fill(art);
  await vorschlag.getByLabel("Schwierigkeit *").selectOption({ index: 1 });
  await vorschlag.getByLabel("Standard-Stufe (Lichtzone) *").selectOption("3");
  await vorschlag.getByLabel(/Lichtbedarf/).fill("40000");
  await vorschlag.getByLabel("Wachstumsmaß *").selectOption("rosettendurchmesser");
  await vorschlag.getByLabel("Vergeilung-Anzeichen *").fill("Die Rosette streckt sich.");
  await vorschlag.getByLabel("Erfolgskriterien *").fill("Dichte, flache Rosette.");
  await vorschlag.getByRole("button", { name: "Vorschlag speichern" }).click();
  await page.getByRole("button", { name: "Diese Art wählen" }).click();
  await page
    .getByRole("form", { name: "Exemplar anlegen" })
    .getByRole("button", { name: "Exemplar anlegen" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Bestand" })).toBeVisible();
}

test.describe("US-WAC-01 Messung erfassen", () => {
  test("US-WAC-01 Messung erfassen, im Verlauf sehen und nach dem Neuladen wiederfinden", async ({
    page,
    konto,
  }, info) => {
    await anmelden(page, konto);
    await mitExemplar(page, "Echeveria elegans");
    await page.getByRole("button", { name: /^Messen: / }).click();

    await expect(page.getByRole("heading", { level: 1, name: /^Messen: / })).toBeVisible();
    await expect(page.getByText("Was messen?")).toBeVisible();
    await expect(page.getByText("Rosettendurchmesser.")).toBeVisible();
    await expect(page.getByText("noch keine Messung").first()).toBeVisible();
    await expect(page.getByText("Trage oben den ersten Messwert ein.")).toBeVisible();
    await axeBericht(page, info, "messen-leer");

    const formular = page.getByRole("form", { name: "Messung erfassen" });
    await formular.getByLabel(/^Messwert/).fill("12,5");
    await formular.getByLabel("Notiz (optional)").fill("nach dem Umtopfen");
    await formular.getByRole("button", { name: "Messung speichern" }).click();

    await expect(page.getByText(/^Gespeichert: 12,5 cm am \d\d\.\d\d\.\d{4}\.$/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: /^12,5 cm · / })).toBeVisible();
    await expect(page.getByText("nach dem Umtopfen")).toBeVisible();
    await axeBericht(page, info, "messen-erfasst");

    // Nachtragen: ein früheres Datum und die Qualität „Vergeilt/dünn“.
    await formular.getByLabel(/^Messwert/).fill("10");
    await formular.getByLabel("Datum").fill("2026-01-02");
    await formular.getByLabel("Qualität").selectOption("vergeilt");
    await formular.getByRole("button", { name: "Messung speichern" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "10 cm · 02.01.2026" })).toBeVisible();
    // Die letzte Messung ist die vom neueren Datum, nicht die zuletzt eingetragene.
    await expect(
      page.getByText(/Letzte Messung/).locator("xpath=following-sibling::dd"),
    ).toContainText("12,5 cm");

    // Nichts geht still verloren (P-10): nach dem Neuladen stehen die Messungen aus der Datenbank wieder da.
    await page.reload();
    await page.getByRole("button", { name: "Bestand" }).click();
    await page.getByRole("button", { name: /^Messen: / }).click();
    await expect(page.getByRole("heading", { level: 3, name: "10 cm · 02.01.2026" })).toBeVisible();
  });

  test("US-WAC-01 eine ungültige Eingabe wird abgelehnt und schreibt nichts", async ({
    page,
    konto,
  }) => {
    await anmelden(page, konto);
    await mitExemplar(page, "Aloe polyphylla");
    await page.getByRole("button", { name: /^Messen: / }).click();
    const formular = page.getByRole("form", { name: "Messung erfassen" });
    for (const wert of ["abc", "-3"]) {
      await formular.getByLabel(/^Messwert/).fill(wert);
      await formular.getByRole("button", { name: "Messung speichern" }).click();
      await expect(page.getByRole("alert")).toContainText("Bitte gib eine Zahl ab 0 an");
    }
    await expect(page.getByText("Trage oben den ersten Messwert ein.")).toBeVisible();
  });
});
