import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { SIZES } from "../../../support/display/one-screen/judge";
import { A11Y_SIZES } from "../../../support/display/a11y/findings";
import {
  SCREENS,
  costOf,
  medianOf,
  planShards,
  screensOf,
  weightOf,
  type Screen,
} from "../../../support/display/one-screen/register";
import { coverageProblems } from "./merge-shards";

// US-QG-01 (issue 1485, owner decision 2026-11-07): the shards of the UI gates. Each shard runs its screens of both gates. The
// split is one partition of the register, balanced by the measured weights, and merge-shards proves the partition at the end of
// the run. Pure self-tests, no browser and no web stack; the project "one-screen" runs this file (playwright.config.ts).

// US-QG-01 (issue 1667): the shards are the matrix of the job `ui-shard` in ci.yml (`shard: [1, 2, ...]`), so the self-tests
// follow the CI matrix and a change of the matrix needs no change here.
const CI_WORKFLOW = new URL("../../../../../../.github/workflows/ci.yml", import.meta.url);
function matrixShards(): number[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed file of the repository
  const workflow = readFileSync(CI_WORKFLOW, "utf8");
  const start = workflow.indexOf("\n  ui-shard:");
  const match = /^\s+shard: \[([\d, ]+)\]/m.exec(workflow.slice(Math.max(start, 0)));
  if (start < 0 || !match) throw new Error("the job ui-shard of ci.yml lists no shard matrix");
  return (match[1] ?? "").split(",").map((shard) => Number(shard.trim()));
}
const SHARDS = matrixShards();
const SPLIT = SHARDS.length;
const screenIds = SCREENS.map((screen) => screen.id);
const shardIds = (index: number): string[] =>
  screensOf("", `${index}/${SPLIT}`).map((screen) => screen.id);
/** The measurements of the given shards, one per screen and size, as the reporters write them. */
const measuredOf = (indexes: number[], sizes: readonly string[]) =>
  indexes.flatMap((index) =>
    shardIds(index).flatMap((screen) => sizes.map((size) => ({ screen, size }))),
  );
const GATE_SIZES = [
  { gate: "one-screen", sizes: SIZES.map((size) => size.name) },
  { gate: "a11y-routes", sizes: A11Y_SIZES.map((size) => size.name) },
];

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

test.describe("US-QG-01 self-test: the shards of the UI gates", () => {
  test("US-QG-01 self-test: the CI matrix lists the shards 1 to n, and n is at most 6", () => {
    expect(SHARDS).toEqual(Array.from({ length: SPLIT }, (_, index) => index + 1));
    // The Free plan runs at most 20 jobs at once; one job per shard keeps the UI gates inside that budget.
    expect(SPLIT).toBeLessThanOrEqual(6);
  });

  test("US-QG-01 self-test: the shards of the CI matrix hold every screen of the register once, in both gates", () => {
    for (const { gate, sizes } of GATE_SIZES) {
      expect(coverageProblems(measuredOf(SHARDS, sizes), screenIds, sizes), gate).toEqual([]);
    }
  });

  test("US-QG-01 self-test: a shard that is missing, or a screen measured twice, fails the merge proof", () => {
    const sizes = SIZES.map((size) => size.name);
    expect(coverageProblems(measuredOf([1, 2, 3], sizes), screenIds, sizes)[0]).toContain(
      "not measured",
    );
    const doubled = [...measuredOf(SHARDS, sizes), ...measuredOf([1], sizes)];
    expect(coverageProblems(doubled, screenIds, sizes)[0]).toContain("measured more than once");
  });

  test("US-QG-01 self-test: the split is balanced: no shard exceeds the mean cost of the shards by more than 10 %", () => {
    const loads = SHARDS.map((index) => shardIds(index).reduce((sum, id) => sum + costOf(id), 0));
    const mean = loads.reduce((sum, load) => sum + load, 0) / SPLIT;
    for (const load of loads) expect(load).toBeLessThanOrEqual(mean * 1.1);
  });

  test("US-QG-01 self-test: the split does not depend on the order of the register", () => {
    expect(new Map(planShards([...SCREENS].reverse(), SPLIT))).toEqual(
      new Map(planShards(SCREENS, SPLIT)),
    );
  });

  test("US-QG-01 self-test: a screen without a weight counts as the median of its gate and still gets a shard", () => {
    expect(weightOf("one-screen", "a-new-screen")).toBe(medianOf("one-screen"));
    expect(weightOf("a11y-routes", "a-new-screen")).toBe(medianOf("a11y-routes"));
    const fresh: Screen = { id: "a-new-screen", account: "test2", path: "/today" };
    const plan = planShards([...SCREENS, fresh], SPLIT);
    expect(plan.size).toBe(SCREENS.length + 1);
    expect(plan.get("a-new-screen")).toBeGreaterThanOrEqual(1);
  });

  test("US-QG-01 self-test: a shard is i/n with 1 <= i <= n, and SCREEN with SHARD is refused", () => {
    expect(() => screensOf("", "5/4")).toThrow("must be i/n");
    expect(() => screensOf("", "0/4")).toThrow("must be i/n");
    expect(() => screensOf("", "two")).toThrow("must be i/n");
    expect(() => screensOf("today", "1/4")).toThrow("cannot be combined with SHARD");
    expect(screensOf("", "")).toEqual(SCREENS);
    expect(screensOf("today")).toHaveLength(1);
  });
});
