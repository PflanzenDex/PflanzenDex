import { test as base, type Browser, type BrowserContext } from "@playwright/test";
import { settle } from "./fit";

// Sign-in of the one-screen gate (issue 1137, QG-U8): the dev accounts test, test2 and test3 of the realm import
// (docs/guides/reference/app.md) sign in through the real sign-in page.

export const WEB = `http://localhost:${process.env["E2E_WEB_PORT"] ?? "5173"}`;
const PASSWORD = "testtest12";

export type SignedInState = Awaited<ReturnType<BrowserContext["storageState"]>>;
type States = (account: string) => Promise<SignedInState | undefined>;

/** Signs in through the real sign-in page and returns the state of that session with its own tokens (never a shared one). */
export async function signInState(browser: Browser, account: string): Promise<SignedInState> {
  const context = await browser.newContext({ locale: "de-DE" });
  const page = await context.newPage();
  await page.goto(WEB + "/");
  await page
    .getByRole("button", { name: /anmelden/i })
    .first()
    .click();
  await page.locator("#username").fill(account);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await page.waitForURL(`${WEB}/**`);
  await settle(page, 1500);
  const state = await context.storageState();
  await context.close();
  return state;
}

// Signs in per worker and account and reuses the state, but only for 4 minutes: access tokens live 300 s and refresh
// tokens rotate (realm import), so an older snapshot gets signed out once another context has refreshed it.
const FRESH_MS = 240_000;
export const test = base.extend<object, { states: States }>({
  states: [
    async ({ browser }, use) => {
      const cache = new Map<string, { at: number; state: ReturnType<States> }>();
      await use(async (account) => {
        if (account === "anon") return undefined;
        const known = cache.get(account);
        if (known && Date.now() - known.at < FRESH_MS) return known.state;
        const state = signInState(browser, account);
        cache.set(account, { at: Date.now(), state });
        return state;
      });
    },
    { scope: "worker" },
  ],
});
