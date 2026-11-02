import { expect } from "@playwright/test";
import { test } from "../../../support/display/one-screen/sign-in";
import { buildBaseline, judgeScreen } from "../../../support/display/one-screen/baseline";
import { evaluate, type Raw, type Size } from "../../../support/display/one-screen/judge";

// Self-test of the sideways metrics of the one-screen gate (issue 1183, QG-U8): pure, no browser. Registered from
// tests/accessibility/routes/one-screen.spec.ts, the only spec the project "one-screen" runs.
export function sidewaysSelfTests(
  raw: (over: Partial<Raw>) => Raw,
  sizeOf: (name: string) => Size,
): void {
  test.describe("QG-U8 self-test: sideways", () => {
    const size = sizeOf("360x640");
    const wide = { scrollWidth: 468, clientWidth: 360, el: "div.chips" };

    test("QG-U8 an inner region wider than its box fails and names it; the page is judged by 1.00 + 1 px", () => {
      const r = evaluate("s", size, raw({ regionX: wide }));
      expect(r.innerX).toBe(1.3);
      expect(r.failures[0]).toContain("inner sideways 1.30");
      expect(r.failures[0]).toContain("div.chips");
      expect(evaluate("s", size, raw({ scrollWidth: 361 })).failures).toEqual([]);
      const page = evaluate("s", size, raw({ scrollWidth: 374, hEl: "table" }));
      expect(page.pageX).toBe(1.04);
      expect(page.failures[0]).toContain("page sideways 1.04");
      expect(page.failures[0]).toContain("table");
    });

    test("QG-U8 at 200 % text an inner sideways region fails, an inner vertical region does not", () => {
      const zoomed = sizeOf("360x640@200%");
      const tall = { scrollHeight: 900, clientHeight: 300, el: "div" };
      expect(evaluate("s", zoomed, raw({ region: tall })).failures).toEqual([]);
      expect(evaluate("s", zoomed, raw({ regionX: wide })).failures[0]).toContain("inner sideways");
    });

    test("QG-U8 sidewaysExempt skips only the inner region, not the page", () => {
      expect(evaluate("s", size, raw({ regionX: wide }), true).failures).toEqual([]);
      expect(
        evaluate("s", size, raw({ regionX: wide, scrollWidth: 400 }), true).failures[0],
      ).toContain("page sideways");
    });

    test("QG-U8 the baseline accepts a known pageX/innerX and reports a stale one", () => {
      const failing = evaluate("s", size, raw({ regionX: wide, scrollWidth: 400 }));
      const listed = buildBaseline([failing]);
      expect(listed.entries[0]).toMatchObject({ pageX: 1.11, innerX: 1.3 });
      expect(judgeScreen([failing], listed)).toEqual([]);
      const worse = evaluate("s", size, raw({ regionX: { ...wide, scrollWidth: 540 } }));
      expect(judgeScreen([worse], listed)[0]).toContain("innerX");
      expect(judgeScreen([evaluate("s", size, raw({}))], listed)[0]).toContain("fits now");
    });
  });
}
