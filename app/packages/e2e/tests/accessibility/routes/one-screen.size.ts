import { expect } from "@playwright/test";
import { test } from "../../../support/display/one-screen/sign-in";
import {
  buildBaseline,
  judgeBaseline,
  judgeScreen,
} from "../../../support/display/one-screen/baseline";
import { evaluate, type Raw, type Size } from "../../../support/display/one-screen/judge";
import type { Sized } from "../../../support/display/one-screen/judge.types";

// Self-test of the size floors of the one-screen gate (issue 2431, P-S, US-QS-15, QG-U8): pure, no browser. A picture, a text
// box, a row or a name below its floor fails as rule `size`, even when nothing overflows. Registered from one-screen.spec.ts.

const empty: Sized = { pictures: [], texts: [], rows: [], names: [] };

export function sizeSelfTests(
  raw: (over: Partial<Raw>) => Raw,
  sizeOf: (name: string) => Size,
): void {
  test.describe("QG-U8 US-QS-15 self-test: size floors", () => {
    const phone = sizeOf("360x640");
    const zoomed = sizeOf("360x640@200%");
    const judge = (sized: Partial<Sized>, size = phone) =>
      evaluate("s", size, raw({ sized: { ...empty, ...sized } }));

    test("QG-U8 US-QS-15 the 53x40 card picture of #2383 fails, a full-width 4:3 picture passes", () => {
      const small = judge({ pictures: [{ el: "figure", width: 53, height: 40 }] });
      expect(small.rules).toEqual(["size"]);
      expect(small.failures[0]).toContain("53 px x 40 px");
      expect(judge({ pictures: [{ el: "figure", width: 328, height: 246 }] }).failures).toEqual([]);
    });

    test("QG-U8 US-QS-15 a picture that is not 4:3 fails", () => {
      expect(judge({ pictures: [{ el: "figure", width: 328, height: 160 }] }).rules).toEqual([
        "size",
      ]);
    });

    test("QG-U8 US-QS-15 the 1 to 2 px rows of #2315 fail, also at 200 % text", () => {
      expect(judge({ rows: [{ el: "div", height: 2 }] }).rules).toEqual(["size"]);
      expect(judge({ rows: [{ el: "div", height: 1 }] }, zoomed).rules).toEqual(["size"]);
      expect(judge({ rows: [{ el: "div", height: 72 }] }).failures).toEqual([]);
    });

    test("QG-U8 US-QS-15 a text box under one line and a name under 96 px fail", () => {
      expect(judge({ texts: [{ el: "span", height: 4, lineHeight: 24 }] }).rules).toEqual(["size"]);
      expect(judge({ texts: [{ el: "span", height: 23.5, lineHeight: 24 }] }).failures).toEqual([]);
      expect(judge({ names: [{ el: "span", width: 12 }] }).rules).toEqual(["size"]);
      expect(judge({ names: [{ el: "span", width: 180 }] }).failures).toEqual([]);
    });

    test("QG-U8 US-QS-15 a listed size failure that fits now is stale", () => {
      const before = buildBaseline([judge({ rows: [{ el: "div", height: 2 }] })]);
      const now = judge({ rows: [{ el: "div", height: 72 }] });
      expect(judgeScreen([now], before)[0]).toContain("fits now");
    });
  });
}

/** The baseline side of issues 2427 and 2431: a not-measured screen is never listed, and a debt entry names a real issue. */
export function measuredSelfTests(
  raw: (over: Partial<Raw>) => Raw,
  sizeOf: (name: string) => Size,
): void {
  test.describe("QG-U8 US-QS-15 self-test: not measured and debt entries", () => {
    const phone = sizeOf("360x640");
    test("QG-U8 US-QS-15 a not-measured first screen is never baselined (issue 2427)", () => {
      const lost = evaluate("s", phone, raw({ first: null }));
      expect(lost.rules).toEqual(["measured"]);
      expect(buildBaseline([lost]).entries).toEqual([]);
      const listed = {
        maxEntries: 1,
        entries: [
          { screen: "s", size: phone.name, page: 1, inner: 1, rules: ["measured" as const] },
        ],
      };
      expect(judgeScreen([lost], listed)[0]).toContain("not measured");
      expect(judgeBaseline(listed, new Set(["s"]), new Set([phone.name]))[0]).toContain(
        "never baselined",
      );
    });

    test("QG-U8 US-QS-15 an entry's debt issue must be a positive number", () => {
      const entry = { screen: "s", size: phone.name, page: 1, inner: 1, issue: 0 };
      expect(
        judgeBaseline(
          { maxEntries: 1, entries: [entry] },
          new Set(["s"]),
          new Set([phone.name]),
        )[0],
      ).toContain("no valid issue");
    });
  });
}
