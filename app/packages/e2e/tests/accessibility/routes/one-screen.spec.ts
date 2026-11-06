import { expect } from "@playwright/test";
import { WEB, test } from "../../../support/display/one-screen/sign-in";
import { readBaseline, saveResults } from "../../../support/display/reporter";
import { measure, openScreen, settle } from "../../../support/display/one-screen/fit";
import { SCREENS, screensOf, type Screen } from "../../../support/display/one-screen/register";
import {
  SIZES,
  evaluate,
  type Baseline,
  type Raw,
  type Size,
  type Result,
} from "../../../support/display/one-screen/judge";
import { sidewaysSelfTests } from "./one-screen-sideways";
import {
  buildBaseline,
  judgeBaseline,
  judgeScreen,
  lostScreen,
} from "../../../support/display/one-screen/baseline";
import { coverageProblems } from "./merge-shards";

// US-QS-15, DS-58, QG-U8 (issue 1137): every screen of the register fits at every size; opened once, resized through the
// sizes, writes aborted. `make one-screen`; the project "one-screen" is not part of `make e2e`.

const API = `http://localhost:${process.env["E2E_API_PORT"] ?? "3000"}`;
const WRITE = process.env["ONE_SCREEN_WRITE"] === "1";

// SCREEN of make one-screen (issue 1608): a partial run writes no baseline and is no shard; make refuses both first.
const ONLY = process.env["ONE_SCREEN_ONLY"] ?? "";
if (ONLY && (WRITE || process.env["ONE_SCREEN_SHARD"]))
  throw new Error("one-screen: SCREEN is a partial run: no baseline write, no shard");
const SELECTED = screensOf(ONLY);

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
    results.push(evaluate(screen.id, size, raw, Boolean(screen.sidewaysExempt)));
  }
  return results;
}

test.describe("US-QS-15 every screen fits the window (QG-U8)", () => {
  for (const screen of SELECTED) {
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
        const lost = lostScreen(WEB + screen.path, page.url());
        if (lost) throw new Error(`${screen.id}: ${lost}`);
        saveResults(screen.id, results);
        if (!WRITE)
          expect(judgeScreen(results, readBaseline(), Boolean(screen.unstable)), screen.id).toEqual(
            [],
          );
      } finally {
        await context.close();
      }
    });
  }
});

const sizeOf = (name: string) => SIZES.find((s) => s.name === name) as Size;

const raw = (over: Partial<Raw>): Raw => ({
  ...{ scrollHeight: 640, innerHeight: 640, scrollWidth: 360, innerWidth: 360, region: null },
  ...{ pageEl: "main", hEl: "div", regionX: null, paint: null },
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
  const unstable = buildBaseline([evaluate("s", size, raw({ scrollHeight: 960 }))]);
  expect(judgeScreen([evaluate("s", size, raw({}))], unstable, true)).toEqual([]);
});

test("QG-U8 self-test: at 200 % text a taller region is no regression, a taller page is", () => {
  const zoomed = sizeOf("360x640@200%");
  const region = (inner: number) => ({ scrollHeight: inner, clientHeight: 300, el: "div" });
  const tall = (inner: number) =>
    evaluate("s", zoomed, raw({ scrollHeight: 1247, region: region(inner) }));
  const listed = buildBaseline([tall(600)]);
  expect(judgeScreen([tall(1200)], listed)).toEqual([]);
  const page = evaluate("s", zoomed, raw({ scrollHeight: 1400, region: region(600) }));
  expect(judgeScreen([page], listed)[0]).toContain("worse");
});

sidewaysSelfTests(raw, sizeOf);

test("QG-U8 self-test: a screen that lands on Heute instead of its path is named", () => {
  expect(lostScreen("http://x/account/data", "http://x/today")).toContain("landed on /today");
  expect(lostScreen("http://x/today?sheet=plan", "http://x/today")).toBeNull();
});

test("US-QG-01 self-test: the shards of a gate together measure every screen and size exactly once", () => {
  const screens = ["a", "b"];
  const sizes = ["s1", "s2"];
  const all = screens.flatMap((screen) => sizes.map((size) => ({ screen, size })));
  expect(coverageProblems(all, screens, sizes)).toEqual([]);
  expect(coverageProblems(all.slice(1), screens, sizes)[0]).toContain("not measured (1)");
  expect(coverageProblems([...all, ...all.slice(0, 1)], screens, sizes)[0]).toContain(
    "measured more than once",
  );
  expect(coverageProblems([...all, { screen: "x", size: "s1" }], screens, sizes)[0]).toContain(
    "not in the register",
  );
});
