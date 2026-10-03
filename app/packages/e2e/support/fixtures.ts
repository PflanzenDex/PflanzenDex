import { expect, test as base, type Page } from "@playwright/test";
import { legeTestkontoAn, type Testkonto } from "./konto";

export { expect };

export async function anmelden(page: Page, konto: Testkonto): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.locator("#username").fill(konto.email);
  await page.locator("#password").fill(konto.passwort);
  await page.locator("#kc-login").click();
  await expect(page.getByRole("navigation", { name: "Hauptnavigation" })).toBeVisible();
}

/** Login, then open the Standorte-und-Licht view (the start view is the Arten search since US-BES-01). */
export async function anmeldenBeiLicht(page: Page, konto: Testkonto): Promise<void> {
  await anmelden(page, konto);
  await page.getByRole("button", { name: "Standorte und Licht" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Standorte und Lichtzonen/ }),
  ).toBeVisible();
}

// Every test gets its own account: tenant isolation (P-04) keeps tests independent of each other.
export const test = base.extend<{ konto: Testkonto }>({
  // eslint-disable-next-line no-empty-pattern
  konto: async ({}, use) => {
    await use(await legeTestkontoAn());
  },
});
