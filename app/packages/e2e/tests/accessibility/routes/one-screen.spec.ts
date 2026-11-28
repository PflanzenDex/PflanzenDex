import { expect } from "@playwright/test";
import { WEB, test } from "../../../support/display/one-screen/sign-in";
import { readBaseline, saveResults } from "../../../support/display/reporter";
import { openScreen } from "../../../support/display/one-screen/fit";
import { applyFail, applyReply, checkExpect } from "../../../support/display/one-screen/fit.expect";
import { SCREENS, idsFromEnv, screensOf } from "../../../support/display/one-screen/register";
import { sizesOf } from "../../../support/display/one-screen/register.check";
import { activeSizeSet } from "../../../support/display/selection/size-set";
import {
  SIZES,
  evaluate,
  type Baseline,
  type Raw,
  type Size,
} from "../../../support/display/one-screen/judge";
import { measureAll } from "./one-screen.measure";
import { registerSelfTests } from "./one-screen.register";
import { replySelfTests } from "./one-screen.reply";
import { firstSelfTests, goodFirst } from "./one-screen.first";
import { layerSelfTests } from "./one-screen.phone";
import { measuredSelfTests, sizeSelfTests } from "./one-screen.size";
import { sidewaysSelfTests } from "./one-screen-sideways";
import { shiftJudgeSelfTests, shiftSelfTests, shiftTests } from "./one-screen.shift";
// Registers the browser self-test of the settle (US-QG-01, issue 2429): its tests run in the browser of the gate.
import "./one-screen.settle";
import {
  buildBaseline,
  judgeBaseline,
  judgeScreen,
  lostScreen,
} from "../../../support/display/one-screen/baseline";

// US-QS-15, DS-58, QG-U8 (issue 1137): every screen of the register fits at every size; opened once, resized through the
// sizes, writes aborted. `make one-screen`, or one shard of the CI job of both UI gates (`make ui-gates`, US-QG-01); the
// project "one-screen" is not part of `make e2e`.

const API = `http://localhost:${process.env["E2E_API_PORT"] ?? "3000"}`;
const WRITE = process.env["ONE_SCREEN_WRITE"] === "1";

// SCREEN of make one-screen (issue 1608) and SHARD of make ui-gates (US-QG-01): a partial run writes no baseline. Make
// refuses SCREEN with SHARD first; the register refuses it too.
const ONLY = process.env["ONE_SCREEN_ONLY"] ?? "";
const SHARD = process.env["ONE_SCREEN_SHARD"] ?? "";
if (ONLY && (WRITE || SHARD))
  throw new Error("one-screen: SCREEN is a partial run: no baseline write, no shard");
if (SHARD && WRITE) throw new Error("one-screen: SHARD is a partial run: no baseline write");
const SELECTED = screensOf(ONLY, SHARD);
// US-QG-02 (issue 2666): a write needs the whole register at every size: a partial size set or selection never writes.
const SIZE_SET = activeSizeSet();
if (WRITE && (SIZE_SET !== "all" || idsFromEnv().length > 0))
  throw new Error(`one-screen: a partial run (ONE_SCREEN_SIZES=${SIZE_SET}): no baseline write`);

test.describe.configure({ mode: "parallel", timeout: 150_000 });

test.describe("US-QS-15 every screen fits the window (QG-U8)", () => {
  for (const screen of SELECTED) {
    const none = sizesOf(screen).length === 0;
    test(`US-QS-15 one screen: ${screen.id}`, async ({ browser, states }) => {
      // No size of the set applies to this screen: nothing is measured and no results file is written (US-QG-02).
      test.skip(none, `${screen.id}: ONE_SCREEN_SIZES=${SIZE_SET} names none of its sizes`);
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
      await applyFail(context, screen, API);
      await applyReply(context, screen, API);
      const page = await context.newPage();
      page.on("dialog", (dialog) => void dialog.dismiss().catch(() => undefined));
      try {
        await openScreen(page, WEB, screen);
        await checkExpect(page, screen);
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
  ...{ scrollHeight: 640, innerHeight: 640, scrollWidth: 360, innerWidth: 360, rem: 16 },
  ...{ scrollers: [], sideways: [], markers: [], pagers: [] },
  ...{ pageEl: "main", hEl: "div", paint: null, first: goodFirst() },
  ...over,
});

// The comparison with the baseline needs no browser: this self-test pins its rules (FR-QG-17).
test.describe("QG-U8 self-test: the one-screen judgement", () => {
  const size = sizeOf("360x640");
  const none: Baseline = { maxEntries: 0, entries: [] };

  // From 768 px the page and every region still fit; on a phone the first screen is judged instead (issue 1854).
  const tablet = sizeOf("768x1024");
  const rawTablet = (over: Partial<Raw>) =>
    raw({
      ...{ innerHeight: 1024, scrollHeight: 1024, innerWidth: 768, scrollWidth: 768 },
      ...over,
    });

  test("QG-U8 a page one pixel too tall still fits, two pixels do not (from 768 px)", () => {
    expect(evaluate("s", tablet, rawTablet({ scrollHeight: 1025 })).failures).toEqual([]);
    const tall = evaluate("s", tablet, rawTablet({ scrollHeight: 1536, pageEl: "ul.list" }));
    expect(tall.page).toBe(1.5);
    expect(tall.failures[0]).toContain("page 1.50");
    expect(tall.failures[0]).toContain("ul.list");
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
    const failing = evaluate("s", tablet, rawTablet({ scrollHeight: 1536 }));
    expect(judgeScreen([failing], none)).toHaveLength(1);
    const listed = buildBaseline([failing]);
    expect(judgeScreen([failing], listed)).toEqual([]);
    const worse = evaluate("s", tablet, rawTablet({ scrollHeight: 1760 }));
    expect(judgeScreen([worse], listed)[0]).toContain("worse than the baseline");
    const fits = evaluate("s", tablet, rawTablet({}));
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
  const tablet = sizeOf("768x1024");
  const at = (scrollHeight: number) =>
    evaluate(
      "s",
      tablet,
      raw({ ...{ innerHeight: 1024, innerWidth: 768, scrollWidth: 768 }, scrollHeight }),
    );
  const listed = buildBaseline([at(1040)]);
  expect(judgeScreen([at(1024)], listed)).toEqual([]);
  const unstable = buildBaseline([at(1536)]);
  expect(judgeScreen([at(1024)], unstable, true)).toEqual([]);
});

sidewaysSelfTests(raw, sizeOf);
firstSelfTests(raw, sizeOf);
layerSelfTests(raw, sizeOf);
sizeSelfTests(raw, sizeOf);
measuredSelfTests(raw, sizeOf);
registerSelfTests();
replySelfTests();

test("QG-U8 self-test: a screen that lands on Heute instead of its path is named", () => {
  expect(lostScreen("http://x/account/data", "http://x/today")).toContain("landed on /today");
  expect(lostScreen("http://x/today?sheet=plan", "http://x/today")).toBeNull();
});

shiftSelfTests();
shiftJudgeSelfTests();
shiftTests(SELECTED, API, WRITE);
