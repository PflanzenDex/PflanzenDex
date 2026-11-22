import { expect } from "@playwright/test";
import { test } from "../../../support/display/one-screen/sign-in";
import { buildBaseline, judgeScreen } from "../../../support/display/one-screen/baseline";
import { evaluate, type Raw, type Size } from "../../../support/display/one-screen/judge";

// Self-test of the Pager rule of the one-screen gate (US-QS-15, DS-60, QG-U8; issue 2417): pure, no browser. No data is cut into
// pages at any size: a visible `data-pager` (the root of `Pager`) fails by name. Until the removal of `Pager` (issue 2422) its uses
// are listed in the baseline, and a listed one that is gone is stale. Registered from one-screen.spec.ts.

export function pagerSelfTests(
  raw: (over: Partial<Raw>) => Raw,
  sizeOf: (name: string) => Size,
): void {
  test.describe("QG-U8 US-QS-15 self-test: no Pager at any size", () => {
    const tablet = sizeOf("768x1024");
    const phone = sizeOf("360x640");
    const zoomed = sizeOf("360x640@200%");

    test("QG-U8 US-QS-15 a Pager from 768 px fails and names the list it pages", () => {
      const r = evaluate(
        "s",
        tablet,
        raw({
          innerHeight: 1024,
          scrollHeight: 1024,
          innerWidth: 768,
          scrollWidth: 768,
          pagers: ["ul.tiles"],
        }),
      );
      expect(r.rules).toEqual(["pager"]);
      expect(r.failures[0]).toContain("Pager");
      expect(r.failures[0]).toContain("ul.tiles");
    });

    test("QG-U8 US-QS-15 a Pager fails at a phone size and at 200 % text too, and counts several", () => {
      expect(evaluate("s", phone, raw({ pagers: ["ul.a"] })).rules).toEqual(["pager"]);
      const many = evaluate("s", zoomed, raw({ pagers: ["ul.a", "ul.b"] }));
      expect(many.rules).toEqual(["pager"]);
      expect(many.failures[0]).toContain("2 Pagers");
      expect(many.failures[0]).toContain("ul.a");
    });

    test("QG-U8 US-QS-15 a list without a Pager passes; a listed Pager is stale once it is gone (issue 2422)", () => {
      expect(evaluate("s", phone, raw({ pagers: [] })).failures).toEqual([]);
      const listed = buildBaseline([evaluate("s", tablet, raw({ pagers: ["ul.tiles"] }))]);
      expect(listed.entries[0]).toMatchObject({ rules: ["pager"] });
      expect(judgeScreen([evaluate("s", tablet, raw({ pagers: ["ul.tiles"] }))], listed)).toEqual(
        [],
      );
      expect(judgeScreen([evaluate("s", tablet, raw({ pagers: [] }))], listed)[0]).toContain(
        "fits now",
      );
    });
  });
}
