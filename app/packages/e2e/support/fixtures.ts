import { expect, test as base, type Page } from "@playwright/test";
import { createTestAccount, type TestAccount } from "./account";

export { expect };

export async function signIn(page: Page, account: TestAccount): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.locator("#username").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.locator("#kc-login").click();
  // The brand link stands on every width: in the top bar on the phone, in the side navigation on desktop.
  await expect(page.getByRole("link", { name: "PflanzenDéx, zu Heute" })).toBeVisible();
}

/** Login, then open the management of locations and light zones (below the plants of the Sammlung, US-QS-14). */
export async function signInAtLight(page: Page, account: TestAccount): Promise<void> {
  await signIn(page, account);
  await openLocations(page);
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

/** From any signed-in view: the Sammlung, the layer "Ansicht", then "Standorte und Lichtzonen verwalten" (US-QS-19). */
export async function openLocations(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Sammlung", exact: true }).click();
  await page.getByRole("button", { name: "Ansicht" }).click();
  await page.getByRole("button", { name: "Standorte und Lichtzonen verwalten" }).click();
}

/** The first plant of the Sammlung as a layer with its card and actions (US-QS-19). */
export async function openFirstPlant(page: Page): Promise<void> {
  await page.getByRole("list", { name: "Pflanzen" }).getByRole("button").first().click();
}
