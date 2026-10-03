import { axeBericht } from "../support/axe";
import { anmelden, expect, test } from "../support/fixtures";

// Kernablauf R0/R1: Anmeldung gegen den echten Keycloak (US-ACC-01, E-03).
test.describe("US-ACC-01 Anmeldung", () => {
  test("US-ACC-01 Startseite bietet Konto anlegen und Anmelden", async ({ page }, info) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "PflanzenDex" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Konto anlegen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
    await axeBericht(page, info, "start");
  });

  test("US-ACC-01 Anmelden zeigt das eigene Konto und bleibt nach dem Neuladen bestehen", async ({
    page,
    konto,
  }, info) => {
    await anmelden(page, konto);
    await page.getByRole("button", { name: "Konto" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: `Hallo, ${konto.anzeigename}` }),
    ).toBeVisible();
    await expect(page.getByText(konto.email)).toBeVisible();
    await axeBericht(page, info, "konto");
    await page.reload();
    // Nach dem Neuladen öffnet die App wieder die Startansicht, ohne erneute Anmeldung beim Anmeldedienst.
    await expect(
      page.getByRole("heading", { level: 1, name: /Standorte und Lichtzonen/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Anmelden" })).toHaveCount(0);
  });

  test("US-ACC-01 falsche Anmeldedaten bleiben beim Anmeldedienst und lassen niemanden in die App", async ({
    page,
    konto,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await page.locator("#username").fill(konto.email);
    await page.locator("#password").fill("falsches-Passwort-123");
    await page.locator("#kc-login").click();
    await expect(page.getByText(/Ungültig/)).toBeVisible();
    await expect(page).toHaveURL(/localhost:18081/);
  });

  test("US-ACC-01 Abmelden beendet die Sitzung und sagt es", async ({ page, konto }) => {
    await anmelden(page, konto);
    await page.getByRole("button", { name: "Konto" }).click();
    await page.getByRole("button", { name: "Abmelden", exact: true }).click();
    await expect(page.getByText("Du bist abgemeldet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
  });
});
