import { test as base, expect, type BrowserContext } from "@playwright/test";
import { readBaseline, saveResults } from "../../support/display/reporter";
import { SCREENS, measure, openScreen, settle, type Screen } from "../../support/display/fit";
import {
  SIZES,
  buildBaseline,
  evaluate,
  judgeBaseline,
  judgeScreen,
  lostScreen,
  type Baseline,
  type Raw,
  type Size,
  type Result,
} from "../../support/display/judge";

// US-QS-15, DS-58, QG-U8 (issue 1137): every view and layer of the register fits the window at every supported size. Each
// screen is opened once and the same page is resized through the sizes. Writes to the API are aborted, so measuring never
// changes data. Run with `make one-screen`; the project "one-screen" is not part of `make e2e`.

const WEB = `http://localhost:${process.env["E2E_WEB_PORT"] ?? "5173"}`;
const API = `http://localhost:${process.env["E2E_API_PORT"] ?? "3000"}`;
const PASSWORD = "testtest12"; // the dev accounts test, test2, test3 of the realm import (docs/guides/reference/app.md)
const WRITE = process.env["ONE_SCREEN_WRITE"] === "1";

type States = (
  account: string,
) => Promise<Awaited<ReturnType<BrowserContext["storageState"]>> | undefined>;

// Signs in once per worker and account; the sign-in state is reused by every screen of that account.
const test = base.extend<object, { states: States }>({
  states: [
    async ({ browser }, use) => {
      const cache = new Map<string, Promise<Awaited<ReturnType<BrowserContext["storageState"]>>>>();
      const signIn = async (account: string) => {
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
      };
      await use(async (account) => {
        if (account === "anon") return undefined;
        const known = cache.get(account) ?? signIn(account);
        cache.set(account, known);
        return known;
      });
    },
    { scope: "worker" },
  ],
});

test.describe.configure({ mode: "parallel", timeout: 150_000 });

async function measureAll(
  page: import("@playwright/test").Page,
  screen: Screen,
): Promise<Result[]> {
  const results: Result[] = [];
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    if (size.kind === "text200")
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await settle(page, 400);
    const withPaint = size.kind === "cap" && !screen.capExempt;
    const raw: Raw = await measure(page, withPaint);
    results.push(evaluate(screen.id, size, raw));
  }
  return results;
}

test.describe("US-QS-15 every screen fits the window (QG-U8)", () => {
  for (const screen of SCREENS) {
    test(`US-QS-15 one screen: ${screen.id}`, async ({ browser, states }) => {
      const storageState = await states(screen.account);
      const context = await browser.newContext({
        locale: "de-DE",
        colorScheme: "light",
        viewport: { width: 390, height: 844 },
        ...(storageState ? { storageState } : {}),
      });
      await context.route(`${API}/**`, (route) =>
        route.request().method() === "GET" ? route.continue() : route.abort(),
      );
      const page = await context.newPage();
      page.on("dialog", (dialog) => void dialog.dismiss().catch(() => undefined));
      try {
        await openScreen(page, WEB, screen);
        const results = await measureAll(page, screen);
        saveResults(screen.id, results);
        if (!WRITE) expect(judgeScreen(results, readBaseline()), screen.id).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});

const sizeOf = (name: string) => SIZES.find((s) => s.name === name) as Size;

const raw = (over: Partial<Raw>): Raw => ({
  scrollHeight: 640,
  innerHeight: 640,
  scrollWidth: 360,
  innerWidth: 360,
  region: null,
  pageEl: "main",
  hEl: "div",
  paint: null,
  ...over,
});

// The comparison with the baseline needs no browser: this self-test pins its rules (FR-QG-17).
test.describe("QG-U8 self-test: the one-screen judgement", () => {
  const size = sizeOf("360x640");
  const none: Baseline = { maxEntries: 0, entries: [] };

  test("QG-U8 a page one pixel too tall still fits, two pixels do not", () => {
    expect(evaluate("s", size, raw({ scrollHeight: 641 })).failures).toEqual([]);
    const tall = evaluate("s", size, raw({ scrollHeight: 960, pageEl: "ul.list" }));
    expect(tall.page).toBe(1.5);
    expect(tall.failures[0]).toContain("page 1.50");
    expect(tall.failures[0]).toContain("ul.list");
  });

  test("QG-U8 a scroll region taller than itself fails, except at 200 % text", () => {
    const region = { scrollHeight: 900, clientHeight: 300, el: "div.tabs" };
    expect(evaluate("s", size, raw({ region })).failures[0]).toContain("inner 3.00");
    const zoomed = sizeOf("360x640@200%");
    expect(evaluate("s", zoomed, raw({ region })).failures).toEqual([]);
    expect(evaluate("s", zoomed, raw({ scrollWidth: 400 })).failures[0]).toContain("sideways");
  });

  test("QG-U8 the 1920 px cap needs a painted width of at most 1921 px, centered", () => {
    const cap = sizeOf("2560x1440");
    const paint = (left: number, right: number) => ({
      left,
      right,
      clientWidth: 2560,
      leftEl: "aside",
      rightEl: "div",
    });
    expect(evaluate("s", cap, raw({ paint: paint(320, 2240) })).failures).toEqual([]);
    expect(evaluate("s", cap, raw({ paint: paint(0, 2560) })).failures[0]).toContain(
      "cap exceeded",
    );
    expect(evaluate("s", cap, raw({ paint: paint(0, 1920) })).failures[0]).toContain(
      "cap exceeded",
    );
  });

  test("QG-U8 a new failure, a worse one and a stale entry are violations; a known one is not", () => {
    const failing = evaluate("s", size, raw({ scrollHeight: 960 }));
    expect(judgeScreen([failing], none)).toHaveLength(1);
    const listed = buildBaseline([failing]);
    expect(judgeScreen([failing], listed)).toEqual([]);
    const worse = evaluate("s", size, raw({ scrollHeight: 1100 }));
    expect(judgeScreen([worse], listed)[0]).toContain("worse than the baseline");
    const fits = evaluate("s", size, raw({}));
    expect(judgeScreen([fits], listed)[0]).toContain("fits now");
  });

  test("QG-U8 the baseline only shrinks and names only screens and sizes that exist", () => {
    const entry = { screen: "s", size: size.name, page: 2, inner: 1 };
    const grown: Baseline = { maxEntries: 0, entries: [entry] };
    const known = new Set(["s"]);
    const sizes = new Set([size.name]);
    expect(judgeBaseline(grown, known, sizes)[0]).toContain("only shrinks");
    expect(judgeBaseline({ maxEntries: 1, entries: [entry] }, known, sizes)).toEqual([]);
    expect(judgeBaseline({ maxEntries: 1, entries: [entry] }, new Set(), sizes)[0]).toContain(
      "unknown screen",
    );
  });

  test("QG-U8 the checked-in baseline is consistent with the register", () => {
    const sizes = new Set(SIZES.map((s) => s.name));
    expect(judgeBaseline(readBaseline(), new Set(SCREENS.map((s) => s.id)), sizes)).toEqual([]);
  });
});

test("QG-U8 self-test: a borderline entry that fits in one run does not flip the gate", () => {
  const size = sizeOf("360x640");
  const listed = buildBaseline([evaluate("s", size, raw({ scrollHeight: 650 }))]);
  expect(judgeScreen([evaluate("s", size, raw({}))], listed)).toEqual([]);
});

test("QG-U8 self-test: a screen that lands on Heute instead of its path is named", () => {
  expect(lostScreen("http://x/account/data", "http://x/today")).toContain("landed on /today");
  expect(lostScreen("http://x/today?sheet=plan", "http://x/today")).toBeNull();
});
