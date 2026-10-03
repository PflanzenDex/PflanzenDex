import { axeBericht } from "../support/axe";
import { anmeldenBeiLicht, expect, test } from "../support/fixtures";

// Kernablauf R1: Standorte und Lichtzonen einrichten (US-LIC-05), angemeldet, gegen echte API und Datenbank.
test.describe("US-LIC-05 Standorte und Lichtzonen", () => {
  test("US-LIC-05 neues Konto sieht den Leerzustand mit nächster Handlung (P-09)", async ({
    page,
    konto,
  }, info) => {
    await anmeldenBeiLicht(page, konto);
    await expect(page.getByText("Noch keine Lichtzonen.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Standard-Lampen übernehmen" })).toBeVisible();
    await expect(page.getByText("Noch keine Standorte.")).toBeVisible();
    await axeBericht(page, info, "licht-leer");
  });

  test("US-LIC-05 Standard-Lampen übernehmen, Standort anlegen und Lichtzone zuordnen", async ({
    page,
    konto,
  }, info) => {
    await anmeldenBeiLicht(page, konto);
    await page.getByRole("button", { name: "Standard-Lampen übernehmen" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Lampe 2" })).toBeVisible();
    await expect(page.getByText("bis 15.000 Lux")).toBeVisible();

    await page.getByText("Neuer Standort").click();
    const formular = page.getByRole("form", { name: "Standort anlegen" });
    await formular.getByLabel("Name").fill("Balkon");
    await formular.getByLabel("Lichtzone").selectOption({ label: "Lampe 3" });
    await formular.getByLabel("Art").selectOption("aussen");
    await formular.getByRole("button", { name: "Standort anlegen" }).click();

    await expect(page.getByRole("heading", { level: 3, name: "Balkon" })).toBeVisible();
    await expect(page.getByText("Lampe 3 · außen")).toBeVisible();
    await axeBericht(page, info, "licht-eingerichtet");

    // Nichts geht still verloren (P-10): nach dem Neuladen stehen die Daten aus der Datenbank wieder da.
    await page.reload();
    await page.getByRole("button", { name: "Standorte und Licht" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Balkon" })).toBeVisible();
  });

  test("US-LIC-05 Standort ohne Lichtzone erscheint in den Hinweisen mit nächster Handlung", async ({
    page,
    konto,
  }) => {
    await anmeldenBeiLicht(page, konto);
    await page.getByText("Neuer Standort").click();
    const formular = page.getByRole("form", { name: "Standort anlegen" });
    await formular.getByLabel("Name").fill("Regal");
    await formular.getByRole("button", { name: "Standort anlegen" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Hinweise" })).toBeVisible();
    await expect(page.getByText("Weise dem Standort eine Lichtzone zu.")).toBeVisible();
  });

  test("US-LIC-05 eigene Lichtzone anlegen", async ({ page, konto }) => {
    await anmeldenBeiLicht(page, konto);
    const formular = page.getByRole("form", { name: "Lichtzone anlegen" });
    await formular.getByLabel("Name").fill("Fensterbank");
    await formular.getByLabel("Lux-Decke (Lux)").fill("8000");
    await formular.getByRole("button", { name: "Zone anlegen" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Fensterbank" })).toBeVisible();
    await expect(page.getByText("bis 8.000 Lux")).toBeVisible();
  });
});
