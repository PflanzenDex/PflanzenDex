import { axeReport } from "../support/axe";
import { signIn, expect, test } from "../support/fixtures";

// Core flow R0/R1: sign-in against the real Keycloak (US-ACC-01, E-03).
test.describe("US-ACC-01 sign-in", () => {
  test("US-ACC-01 start page offers create account and sign in", async ({ page }, info) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "PflanzenDéx" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Konto anlegen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
    await axeReport(page, info, "start", { blocking: true });
  });

  test("US-ACC-01 signing in shows the own account and persists after reloading", async ({
    page,
    account,
  }, info) => {
    await signIn(page, account);
    await page.getByRole("button", { name: "Konto" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: `Hallo, ${account.displayName}` }),
    ).toBeVisible();
    await expect(page.getByText(account.email)).toBeVisible();
    await axeReport(page, info, "account");
    await page.reload();
    // After reloading the app is back at the start view, without signing in again at the sign-in service.
    await expect(page.getByRole("navigation", { name: "Hauptnavigation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Anmelden" })).toHaveCount(0);
  });

  test("US-ACC-01 wrong credentials stay with the sign-in service and let nobody into the app", async ({
    page,
    account,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await page.locator("#username").fill(account.email);
    await page.locator("#password").fill("falsches-Passwort-123");
    await page.locator("#kc-login").click();
    await expect(page.getByText(/Ungültig/)).toBeVisible();
    await expect(page).toHaveURL(/localhost:18081/);
  });

  test("US-ACC-01 signing out ends the session and says so", async ({ page, account }) => {
    await signIn(page, account);
    await page.getByRole("button", { name: "Konto" }).click();
    await page.getByRole("button", { name: "Abmelden", exact: true }).click();
    await expect(page.getByText("Du bist abgemeldet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
  });
});
