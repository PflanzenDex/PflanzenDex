import type { Browser, Page } from "@playwright/test";
import type { Screen } from "../display/one-screen/register";
import { boolCheck } from "./check";
import { judgeCell, type RunEnv } from "./check.run";
import { applyPageSettings, signInOnPage } from "./device.open";
import { connectPhone, onlineShim, setNightMode, type PhoneSession } from "./device.phone";
import { titleOf, type Cell } from "./device";
import type { Flow } from "./flow";
import { runDirOf, skippedCell, writeCell, type CellRecord } from "./report.cells";
import { failureOf } from "./report.render";

// The cells of the attached phone (US-DEV-01, issue 2504; local only): each cell gets its own Chrome connection, a tab, the sign-in
// of its account and the judgement. The spec resolves the screen and the flow of each cell; this file does the phone part.

/** One phone cell with what it opens: its screen, and its flow when it is one. */
export interface PhonePlan {
  cell: Cell;
  screen: Screen;
  flow: Flow | undefined;
}

/**
 * The script of an account switch: the first document of the tab clears the local storage of its origin once. A script of the
 * page, not an evaluate after a navigation, which would race the redirect to the sign-in (the context is destroyed then).
 */
const CLEAR_ONCE = `(() => {
  if (sessionStorage.getItem("device-check-cleared") !== null) return;
  localStorage.clear();
  sessionStorage.setItem("device-check-cleared", "1");
})();`;

/**
 * A fresh tab of the phone's Chrome for one cell: the navigator.onLine shim first (PF-040), then the text size and forced colors.
 * With `switching`, the cookies of the context go first and the tab clears its local storage once (a new account, no old session).
 */
async function newPhonePage(browser: Browser, cell: Cell, switching: boolean): Promise<Page> {
  const context = browser.contexts()[0] ?? (await browser.newContext());
  if (switching) await context.clearCookies();
  const page = await context.newPage();
  if (switching) await page.addInitScript(CLEAR_ONCE);
  await onlineShim(page);
  await applyPageSettings(page, cell, false);
  return page;
}

/** What one phone cell runs on: the connected Chrome, the phone, the web origin and the account the phone is signed in as. */
interface PhoneAt {
  browser: Browser;
  session: PhoneSession;
  base: string;
  signed: { account: string };
}

/** The judgement of one phone cell on its tab: the sign-in of its account, then the checks. */
async function judgeOnPhone(at: PhoneAt, plan: PhonePlan): Promise<CellRecord> {
  const { browser, session, base, signed } = at;
  const { cell, screen, flow } = plan;
  // The phone keeps its cookies and tokens between cells: a new account starts from an empty session.
  const switching = screen.account !== signed.account && screen.account !== "anon";
  const page = await newPhonePage(browser, cell, switching);
  try {
    if (switching) signed.account = screen.account;
    await signInOnPage(page, base, screen.account);
    const online = await page.evaluate(() => navigator.onLine);
    // A second browser context is not available on the phone: a flow that needs another account's session fails its own check.
    const env: RunEnv = { browser, base, runDir: runDirOf(), signedIn: async () => undefined };
    return await judgeCell({
      page,
      env,
      cell,
      screen,
      ...(flow ? { flow } : {}),
      device: { label: "Real phone", model: session.model, width: 0, height: 0 },
      extra: [
        boolCheck(
          "online: navigator.onLine is true (PF-040)",
          online,
          `navigator.onLine ${online}`,
        ),
      ],
    });
  } finally {
    await page.close().catch(() => undefined);
  }
}

/**
 * One phone cell on its own Chrome connection: the night mode of its theme, the connection, the judgement, then the disconnect.
 * A Chrome that is not reachable makes this cell skipped with the reason (US-DEV-01, P-10); the next cell tries again.
 */
async function phoneCell(
  session: PhoneSession,
  plan: PhonePlan,
  base: string,
  signed: { account: string },
): Promise<CellRecord> {
  await setNightMode(session.serial, plan.cell.theme === "dark");
  let browser: Browser;
  try {
    browser = await connectPhone();
  } catch (error) {
    const why = (error as Error).message.split("\n")[0];
    return skippedCell(
      plan.cell,
      `Chrome on the phone is not reachable over the DevTools socket (${why}): open Chrome on the phone and run again`,
    );
  }
  try {
    return await judgeOnPhone({ browser, session, base, signed }, plan);
  } finally {
    // Disconnects; the phone's Chrome keeps running.
    await browser.close().catch(() => undefined);
  }
}

/** Judges the phone cells in turn; writes each record and returns the failing cells by name. */
export async function runPhoneCells(
  session: PhoneSession,
  plans: readonly PhonePlan[],
  base: string,
): Promise<string[]> {
  const failures: string[] = [];
  const signed = { account: "" };
  for (const plan of plans) {
    const record = await phoneCell(session, plan, base, signed);
    writeCell(runDirOf(), record);
    if (record.status !== "pass" && record.status !== "skipped")
      failures.push(`${titleOf(plan.cell)}: ${failureOf(record)}`);
  }
  return failures;
}
