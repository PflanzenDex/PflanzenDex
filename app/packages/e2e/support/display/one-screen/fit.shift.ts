import type { Browser, BrowserContext, Page } from "@playwright/test";
import { lostScreen } from "./baseline";
import { act, locatorOf } from "./fit";
import type { Size } from "./judge";
import type { Shift } from "./judge.shift";
import type { Screen } from "./register";

// Layout shift of the one-screen project (US-QS-14, DS-52, issue 1697): a cold load per size (a new context, never a resize),
// the API slow on purpose (a GET answers after SLOW_API_MS, a write aborts as in one-screen), and every layout shift the
// page reports. Browser side only: the number is judged in judge.shift.ts.

export const SLOW_API_MS = 1500;
// The quiet time of the settle: 1 s, the session-window gap of the layout-shift score (judge.shift.ts clsOf).
const QUIET_MS = 1000;
const CAP_MS = 15_000;
const POLL_MS = 100;
const STEP_WAIT_MS = 15_000;

export type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** What one cold load produced: the shifts, and whether a status (skeleton or loading text) showed at any time. */
export interface ColdLoad {
  shifts: Shift[];
  skeleton: boolean;
}

interface Watch {
  pending: number;
  last: number;
  skeleton: boolean;
  errors: string[];
}

// Runs in every document before the app: records the layout shifts (the window's log is read back in Node).
function shiftProbe() {
  const w = window as unknown as { __shifts?: unknown[] };
  if (w.__shifts) return;
  const log: unknown[] = [];
  w.__shifts = log;
  const describe = (node: Node | null) => {
    if (!(node instanceof Element)) return "";
    const classes = (node.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 2);
    return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${classes.map((c) => `.${c}`).join("")}`;
  };
  type Entry = {
    startTime: number;
    value: number;
    hadRecentInput: boolean;
    sources?: { node: Node | null }[];
  };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries() as unknown as Entry[])
      log.push({
        t: e.startTime,
        value: e.value,
        recent: e.hadRecentInput,
        sources: (e.sources ?? []).slice(0, 3).map((s) => describe(s.node)),
      });
  }).observe({ type: "layout-shift", buffered: true });
}

// Every GET of the API answers after SLOW_API_MS, every other request aborts (writes), as the one-screen spec does.
async function slowApi(context: BrowserContext, api: string, watch: Watch): Promise<void> {
  await context.route(`${api}/**`, async (route) => {
    if (route.request().method() !== "GET") return route.abort();
    watch.pending++;
    watch.last = Date.now();
    try {
      await new Promise((done) => setTimeout(done, SLOW_API_MS));
      await route.continue();
    } catch (error) {
      watch.errors.push(String(error));
    } finally {
      watch.pending--;
      watch.last = Date.now();
    }
  });
}

// Settles by condition: no GET pending and no shift for QUIET_MS (1 s); the GETs themselves still answer after SLOW_API_MS (1.5 s). A page that does not settle within CAP_MS fails by name.
async function settleShift(page: Page, name: string, watch: Watch): Promise<void> {
  const start = Date.now();
  let seen = -1;
  for (;;) {
    let state: { count: number; status: boolean } | undefined;
    try {
      state = await page.evaluate(() => ({
        count: ((window as unknown as { __shifts?: unknown[] }).__shifts ?? []).length,
        status: document.querySelector("[role=status]") !== null,
      }));
    } catch (error) {
      // A page that navigates while it loads (a sign-in or registration page, a redirect) destroys its context for a moment:
      // it is still loading, so the wait goes on. Any other error is raised; the cap below names a page that never settles.
      if (!String(error).includes("Execution context was destroyed")) throw error;
      watch.last = Date.now();
    }
    if (state) {
      if (state.count !== seen) {
        seen = state.count;
        watch.last = Date.now();
      }
      watch.skeleton = watch.skeleton || state.status;
    }
    if (watch.errors.length > 0)
      throw new Error(`${name}: the slow API route failed: ${watch.errors[0]}`);
    if (state && watch.pending === 0 && Date.now() - watch.last >= QUIET_MS) return;
    if (Date.now() - start > CAP_MS)
      throw new Error(
        `${name}: not settled after ${CAP_MS / 1000} s (${watch.pending} GET pending)`,
      );
    await page.waitForTimeout(POLL_MS);
  }
}

/** One cold load at one size: open the address, settle, then run the steps of the screen (each followed by a settle). */
/** What one cold load needs: its session, the size, the web and API addresses and the screen. */
export interface ColdLoadTarget {
  storageState: StorageState | undefined;
  size: Size;
  base: string;
  api: string;
  screen: Screen;
}

export async function coldLoad(browser: Browser, target: ColdLoadTarget): Promise<ColdLoad> {
  const { storageState, size, base, api, screen } = target;
  const name = `${screen.id} at ${size.name}`;
  const context = await browser.newContext({
    locale: "de-DE",
    colorScheme: "light",
    viewport: { width: size.width, height: size.height },
    ...(storageState ? { storageState } : {}),
  });
  try {
    const watch: Watch = { pending: 0, last: 0, skeleton: false, errors: [] };
    await context.addInitScript(shiftProbe);
    await slowApi(context, api, watch);
    const page = await context.newPage();
    page.on("dialog", (dialog) => void dialog.dismiss().catch(() => undefined));
    watch.last = Date.now();
    await page.goto(base + screen.path);
    await settleShift(page, name, watch);
    const lost = lostScreen(base + screen.path, page.url());
    if (lost) throw new Error(`${screen.id}: ${lost}`);
    for (const step of screen.steps ?? []) {
      // A step waits for its target to show (a list that loads under the slow API), but never longer than STEP_WAIT_MS:
      // a target that does not show fails by name below.
      if (step.key === undefined)
        await locatorOf(page, step)
          .first()
          .waitFor({ state: "visible", timeout: STEP_WAIT_MS })
          .catch(() => undefined);
      await act(page, step).catch((error: Error) => {
        throw new Error(`${name}: step ${JSON.stringify(step)} failed: ${error.message}`);
      });
      await settleShift(page, name, watch);
    }
    const shifts = await page.evaluate(
      () => (window as unknown as { __shifts?: Shift[] }).__shifts ?? [],
    );
    return { shifts, skeleton: watch.skeleton };
  } finally {
    await context.close();
  }
}
