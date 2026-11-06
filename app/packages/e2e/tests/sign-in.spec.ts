import { createTestAccount, FOREIGN_AUDIENCE, foreignAudienceToken } from "../support/account";
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
    await page.getByRole("link", { name: "Konto", exact: true }).click();
    const index = page.getByRole("navigation", { name: "Abschnitte von Konto" });
    // On a phone "/account" is the index under the heading "Konto". From 1024 px Einstellungen opens beside the index
    // by itself and takes the main heading, the index stays (US-QS-17).
    if (info.project.name === "mobil") {
      await expect(page.getByRole("heading", { level: 1, name: "Konto" })).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { level: 1, name: "Einstellungen" })).toBeVisible();
      await expect(index).toBeVisible();
    }
    // The index shows name and e-mail in its profile row (US-QS-17); the greeting is in "Profil".
    await expect(index.getByText(account.displayName, { exact: true })).toBeVisible();
    await expect(index.getByText(account.email, { exact: true })).toBeVisible();
    await axeReport(page, info, "account");
    // Only the profile row shows the e-mail; "Einstellungen" shows the name as its value.
    await index.getByRole("link", { name: account.email }).click();
    await expect(page).toHaveURL(/\/account\/profile$/);
    await expect(page.getByText(`Hallo, ${account.displayName}`)).toBeVisible();
    // On a wide screen the index shows the e-mail too: check the e-mail in the profile card.
    const card = page.locator("dl").filter({ hasText: `Hallo, ${account.displayName}` });
    await expect(card.getByText(account.email, { exact: true })).toBeVisible();
    await page.reload();
    // After reloading the app is back on Heute, without signing in again at the sign-in service.
    await expect(page.getByRole("link", { name: "PflanzenDéx, zu Heute" })).toBeVisible();
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
    await page.getByRole("link", { name: "Konto", exact: true }).click();
    await page.getByRole("button", { name: "Abmelden…", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Abmelden", exact: true }).click();
    await expect(page.getByText("Du bist abgemeldet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
  });
});

// US-ACC-01 another account (issue 667): the way out of a live sign-in at the sign-in service, end to end.
test.describe("US-ACC-01 another account", () => {
  test("US-ACC-01 a live sign-in at the sign-in service ends first, then the other person signs in", async ({
    page,
    account,
  }) => {
    const other = await createTestAccount();
    await signIn(page, account);
    // The state of the bug: the app holds no sign-in any more (cleared storage), the sign-in service still does.
    // The silent attempt was made once in this tab already, so the welcome page shows.
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Anderes Konto" }).click();
    // Without an id token the sign-in service asks once before it ends the session, then returns to the app.
    await page.getByRole("button", { name: "Abmelden", exact: true }).click();
    await expect(page.getByText("Du bist abgemeldet.")).toBeVisible();
    await signIn(page, other);
    await page.getByRole("link", { name: "Konto", exact: true }).click();
    const index = page.getByRole("navigation", { name: "Abschnitte von Konto" });
    await expect(index.getByText(other.email, { exact: true })).toBeVisible();
    await expect(index.getByText(account.email, { exact: true })).toHaveCount(0);
  });
});

// Issue 204: the audience check against tokens of the real Keycloak, not only against test keys.
test.describe("US-ACC-01 token audience", () => {
  test("US-ACC-01 a real token for another audience is refused by the API", async ({
    request,
    account,
  }) => {
    const token = await foreignAudienceToken(account);
    const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as {
      aud: string[];
      iss: string;
    };
    // Signature, issuer and expiry are fine, so the audience is the only reason left for the refusal.
    expect(claims.aud).toContain(FOREIGN_AUDIENCE);
    expect(claims.aud).not.toContain("pflanzendex-api");
    expect(claims.iss).toMatch(/\/realms\/pflanzendex$/);
    const port = process.env["E2E_API_PORT"] ?? "3000";
    const res = await request.get(`http://localhost:${port}/account`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "not_signed_in" } });
  });
});
