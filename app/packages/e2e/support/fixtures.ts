import { expect, test as base, type Page } from "@playwright/test";
import { createTestAccount, type TestAccount } from "./account";

export { expect };

export async function signIn(page: Page, account: TestAccount): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.locator("#username").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.locator("#kc-login").click();
  // The header row of destinations is hidden below md; the brand in the banner stands on every width.
  await expect(page.getByRole("banner").getByRole("link", { name: "PflanzenDex" })).toBeVisible();
}

/** Login, then open the locations-and-light view (the start view is the species search since US-BES-01). */
export async function signInAtLight(page: Page, account: TestAccount): Promise<void> {
  await signIn(page, account);
  await page.getByRole("button", { name: "Standorte und Licht" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Standorte und Lichtzonen/ }),
  ).toBeVisible();
}

// Every test gets its own account: tenant isolation (P-04) keeps tests independent of each other.
export const test = base.extend<{ account: TestAccount }>({
  // eslint-disable-next-line no-empty-pattern
  account: async ({}, use) => {
    await use(await createTestAccount());
  },
});
