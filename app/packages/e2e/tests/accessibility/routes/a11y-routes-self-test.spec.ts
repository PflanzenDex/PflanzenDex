import { expect, test } from "@playwright/test";
import { SCREENS } from "../../../support/display/one-screen/register";
import {
  A11Y_SIZES,
  buildBaseline,
  judgeBaseline,
  judgeResult,
  type Baseline,
  type Finding,
  type Result,
} from "../../../support/display/a11y/findings";
import { readBaseline } from "../../../support/display/a11y/reporter";

// FR-QG-24, QG-U7 (issue 467): the comparison with the baseline needs no browser, so this self-test pins its rules (FR-QG-17).

const phone = "390x844";
const finding = (rule: string, count: number, kind: Finding["kind"] = "axe"): Finding => ({
  kind,
  rule,
  count,
  nodes: Array.from({ length: count }, (_, i) => `button.n${i} "Name"`),
});
const result = (...findings: Finding[]): Result => ({ screen: "s", size: phone, findings });
const none: Baseline = { maxEntries: 0, entries: [] };

test.describe("QG-U7 self-test: the accessibility judgement", () => {
  test("QG-U7 a finding that is not in the baseline names screen, size, check and element", () => {
    const out = judgeResult(result(finding("focus-visible", 1, "keyboard")), none);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("s at 390x844");
    expect(out[0]).toContain("keyboard focus-visible");
    expect(out[0]).toContain('button.n0 "Name"');
  });

  test("QG-U7 a listed finding passes, a higher count fails, a lower count passes", () => {
    const listed = buildBaseline([result(finding("color-contrast", 2))]);
    expect(judgeResult(result(finding("color-contrast", 2)), listed)).toEqual([]);
    expect(judgeResult(result(finding("color-contrast", 1)), listed)).toEqual([]);
    expect(judgeResult(result(finding("color-contrast", 3)), listed)[0]).toContain("worse");
  });

  test("QG-U7 a rule is told apart by kind: axe and keyboard rules do not share an entry", () => {
    const listed = buildBaseline([result(finding("reach", 1, "keyboard"))]);
    expect(judgeResult(result(finding("reach", 1, "axe")), listed)[0]).toContain("axe reach");
  });

  test("QG-U7 a rule that is not found any more is stale, except on an unstable screen", () => {
    const listed = buildBaseline([result(finding("label", 1))]);
    expect(judgeResult(result(), listed)[0]).toContain("remove it from the baseline");
    expect(judgeResult(result(), listed, true)).toEqual([]);
  });

  test("QG-U7 the baseline only shrinks and names only screens and sizes that exist", () => {
    const entry = { screen: "s", size: phone, kind: "axe" as const, rule: "label", count: 1 };
    const known = new Set(["s"]);
    const sizes = new Set([phone]);
    expect(judgeBaseline({ maxEntries: 0, entries: [entry] }, known, sizes)[0]).toContain(
      "only shrinks",
    );
    expect(judgeBaseline({ maxEntries: 1, entries: [entry] }, known, sizes)).toEqual([]);
    expect(judgeBaseline({ maxEntries: 1, entries: [entry] }, new Set(), sizes)[0]).toContain(
      "unknown screen",
    );
    expect(judgeBaseline({ maxEntries: 1, entries: [entry] }, known, new Set())[0]).toContain(
      "unknown size",
    );
  });

  test("QG-U7 a baseline built from results lists every finding and nothing else", () => {
    const built = buildBaseline([
      result(finding("label", 2), finding("skip-link", 1, "keyboard")),
      result(),
    ]);
    expect(built.maxEntries).toBe(2);
    expect(built.entries.map((e) => `${e.kind}:${e.rule}:${e.count}`)).toEqual([
      "axe:label:2",
      "keyboard:skip-link:1",
    ]);
  });

  test("FR-QG-24 the checked-in baseline is consistent with the register", () => {
    const sizes = new Set(A11Y_SIZES.map((s) => s.name));
    expect(judgeBaseline(readBaseline(), new Set(SCREENS.map((s) => s.id)), sizes)).toEqual([]);
  });
});
