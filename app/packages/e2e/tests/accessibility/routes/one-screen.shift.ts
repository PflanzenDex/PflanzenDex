import { expect } from "@playwright/test";
import { WEB, signInState, test } from "../../../support/display/one-screen/sign-in";
import { coldLoad, type StorageState } from "../../../support/display/one-screen/fit.shift";
import {
  SHIFT_SIZES,
  buildShiftBaseline,
  LISTED_FROM,
  clsOf,
  evaluateShift,
  highestOf,
  judgeShift,
  judgeShiftBaseline,
  type Shift,
  type ShiftBaseline,
  type ShiftResult,
} from "../../../support/display/one-screen/judge.shift";
import type { Size } from "../../../support/display/one-screen/judge";
import { SCREENS, type Screen } from "../../../support/display/one-screen/register";
import { readShiftBaseline, saveShiftResults } from "../../../support/display/reporter";

// US-QS-14, DS-52, issue 1697: every screen of the register, cold-loaded at each SHIFT_SIZES size (a new context per load,
// never a resize), its cumulative layout shift judged in judge.shift.ts. Registered from one-screen.spec.ts, the only spec
// the project "one-screen" runs (the shards and the partial runs of that project cover this check too).

const sizeOf = (name: string): Size => SHIFT_SIZES.find((s) => s.name === name) as Size;

export function shiftTests(screens: readonly Screen[], api: string, write: boolean): void {
  test.describe("US-QS-14 layout shift on a cold load (DS-52)", () => {
    for (const screen of screens) {
      test(`US-QS-14 layout shift: ${screen.id}`, async ({ browser }) => {
        // Its own sign-in, never the shared state of the worker: a refresh of the shared session rotates the refresh token,
        // and a context that still holds the old one gets a 400 on its refresh and loses the list (the plant-care finding).
        const storageState: StorageState | undefined =
          screen.account === "anon" ? undefined : await signInState(browser, screen.account);
        const results: ShiftResult[] = [];
        for (const size of SHIFT_SIZES) {
          const load = await coldLoad(browser, { storageState, size, base: WEB, api, screen });
          results.push(evaluateShift(screen.id, size, load.shifts, load.skeleton));
        }
        saveShiftResults(screen.id, results);
        if (!write)
          expect(
            results.flatMap((r) => judgeShift(r, readShiftBaseline(), Boolean(screen.unstable))),
            screen.id,
          ).toEqual([]);
      });
    }
  });
}

// The judgement is pure: its self-tests need no browser (FR-QG-17), like the one-screen ones.
const shift = (t: number, value: number, recent = false): Shift => ({
  t,
  value,
  recent,
  sources: ["div.card"],
});
const none: ShiftBaseline = { maxEntries: 0, entries: [] };
const listed = (cls: number): ShiftBaseline => ({
  maxEntries: 1,
  entries: [{ screen: "s", size: "390x844", cls }],
});
const loadAt = (cls: number, skeleton = false): ShiftResult =>
  evaluateShift("s", sizeOf("390x844"), [shift(0, cls)], skeleton);

export function shiftSelfTests(): void {
  test("US-QS-14 the cumulative shift is the largest session window: gaps under 1 s, at most 5 s long", () => {
    expect(clsOf([shift(0, 0.05)])).toBe(0.05);
    expect(clsOf([shift(0, 0.05), shift(1500, 0.05)])).toBe(0.05);
    expect(clsOf([shift(0, 0.05), shift(900, 0.05)])).toBe(0.1);
    const steady = [0, 900, 1800, 2700, 3600, 4500, 5400].map((t) => shift(t, 0.02));
    expect(clsOf(steady)).toBe(0.12);
  });

  test("US-QS-14 a shift that input caused does not count and does not join a window", () => {
    expect(clsOf([shift(0, 0.3, true), shift(100, 0.05)])).toBe(0.05);
  });

  test("US-QS-14 the plain sum is kept beside the cumulative shift, and the largest element is named", () => {
    const r = evaluateShift("s", sizeOf("390x844"), [shift(0, 0.05), shift(2000, 0.05)], true);
    expect(r).toMatchObject({ cls: 0.05, raw: 0.1, skeleton: true, worst: "div.card" });
  });

  test("US-QS-14 the baseline lists every load above 0.08 with its measured value, and no load under it", () => {
    const built = buildShiftBaseline([
      evaluateShift("a", sizeOf("390x844"), [shift(0, 0.2)], false),
      evaluateShift("b", sizeOf("390x844"), [shift(0, 0.05)], false),
      evaluateShift("c", sizeOf("390x844"), [shift(0, 0.09)], false),
      evaluateShift("d", sizeOf("390x844"), [shift(0, 0.08)], false),
    ]);
    expect(built).toEqual({
      maxEntries: 2,
      entries: [
        { screen: "a", size: "390x844", cls: 0.2 },
        { screen: "c", size: "390x844", cls: 0.09 },
      ],
    });
  });

  test("US-QS-14 the baseline keeps the highest value of a load over several runs, so it is never tighter than a run", () => {
    const first = [evaluateShift("a", sizeOf("1280x800"), [shift(0, 0.06)], false)];
    const second = [evaluateShift("a", sizeOf("1280x800"), [shift(0, 0.098)], false)];
    const merged = highestOf([first, second]);
    expect(merged.map((r) => r.cls)).toEqual([0.098]);
    expect(buildShiftBaseline(merged).entries).toEqual([
      { screen: "a", size: "1280x800", cls: 0.098 },
    ]);
    expect(LISTED_FROM).toBe(0.08);
  });
}

export function shiftJudgeSelfTests(): void {
  test("DS-52 a cold load above the limit fails and names its worst element", () => {
    const [violation] = judgeShift(loadAt(0.2), none);
    expect(violation).toContain("layout shift 0.200 > 0.1");
    expect(violation).toContain("div.card");
  });

  test("DS-52 a load under the limit passes, and a listed one must leave the baseline only when clearly under it", () => {
    expect(judgeShift(loadAt(0.05), none)).toEqual([]);
    expect(judgeShift(loadAt(0.08), listed(0.14))[0]).toContain("fits now");
    expect(judgeShift(loadAt(0.08), listed(0.11))).toEqual([]);
    expect(judgeShift(loadAt(0.08), listed(0.14), true)).toEqual([]);
  });

  test("DS-52 a listed load may get worse by 0.02 at most", () => {
    expect(judgeShift(loadAt(0.21), listed(0.2))).toEqual([]);
    expect(judgeShift(loadAt(0.23), listed(0.2))[0]).toContain("worse than the baseline");
  });

  test("DS-52 a new offender fails even when the baseline lists other loads", () => {
    const other: ShiftBaseline = {
      maxEntries: 1,
      entries: [{ screen: "other", size: "390x844", cls: 0.3 }],
    };
    expect(judgeShift(loadAt(0.2), other)[0]).toContain("s at 390x844");
  });

  test("US-QS-14 the baseline only shrinks and names only screens and sizes that exist", () => {
    const screens = new Set(["s"]);
    const sizes = new Set(["390x844"]);
    const entry = { screen: "s", size: "390x844", cls: 0.2 };
    expect(judgeShiftBaseline({ maxEntries: 0, entries: [entry] }, screens, sizes)[0]).toContain(
      "only shrinks",
    );
    expect(judgeShiftBaseline({ maxEntries: 1, entries: [entry] }, screens, sizes)).toEqual([]);
    expect(judgeShiftBaseline({ maxEntries: 1, entries: [entry] }, new Set(), sizes)[0]).toContain(
      "unknown screen",
    );
  });

  test("DS-52 the cold loads are at 360x640, 390x844 and 1280x800, and the checked-in baseline fits the register", () => {
    expect(SHIFT_SIZES.map((s) => s.name)).toEqual(["360x640", "390x844", "1280x800"]);
    const screens = new Set(SCREENS.map((s) => s.id));
    const sizes = new Set(SHIFT_SIZES.map((s) => s.name));
    expect(judgeShiftBaseline(readShiftBaseline(), screens, sizes)).toEqual([]);
  });
}
