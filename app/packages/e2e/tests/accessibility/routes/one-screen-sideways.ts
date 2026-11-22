import { expect } from "@playwright/test";
import { test } from "../../../support/display/one-screen/sign-in";
import { buildBaseline, judgeScreen } from "../../../support/display/one-screen/baseline";
import {
  evaluate,
  type Raw,
  type Sideways,
  type Size,
} from "../../../support/display/one-screen/judge";

// Self-test of the sideways rule of the one-screen gate (US-QS-15, DS-63, QG-U8; issue 2417): pure, no browser. Neither the page
// nor an unmarked region scrolls sideways (1 px tolerance). Sideways scroll happens only inside an element marked
// `data-scroll-x` with `table`, `cards`, `chips` or `tabs` at every size, and `row` (a segmented control) at 200 % text; a
// missing or unknown value fails by name. Registered from one-screen.spec.ts, the only spec the project runs.

type Raws = (over: Partial<Raw>) => Raw;
type Sizes = (name: string) => Size;

const box = (el: string, marker: string | null, scroll = 468, client = 360): Sideways => ({
  el,
  marker,
  scroll,
  client,
});

// The region kinds: unmarked and invalid regions fail, a marked table, card row, chip row or tab strip passes at every size, and
// a segmented row passes at 200 % text only.
function regionTests(raw: Raws, sizeOf: Sizes): void {
  const size = sizeOf("360x640");
  const zoomed = sizeOf("360x640@200%");

  test("QG-U8 US-QS-15 an unmarked region that scrolls sideways fails and names it: a hand-made overflow container", () => {
    const r = evaluate("s", size, raw({ sideways: [box("div.chips-hand", null)] }));
    expect(r.rules).toEqual(["sideways"]);
    expect(r.innerX).toBe(1.3);
    expect(r.failures[0]).toContain("div.chips-hand");
    expect(r.failures[0]).toContain("without data-scroll-x");
  });

  test("QG-U8 US-QS-15 a marked table, card row, chip row or tab strip may scroll sideways at every size", () => {
    for (const marker of ["table", "cards", "chips", "tabs"]) {
      for (const s of [size, sizeOf("1024x768"), zoomed]) {
        const r = evaluate("s", s, raw({ sideways: [box(`div.${marker}`, marker)] }));
        expect(r.failures, `${marker} at ${s.name}`).toEqual([]);
        expect(r.innerX, `${marker} at ${s.name}`).toBe(1);
      }
    }
  });

  test('QG-U8 US-QS-15 a segmented row (data-scroll-x="row") may scroll sideways only at 200 % text', () => {
    const row = raw({ sideways: [box("div.segments", "row")] });
    const normal = evaluate("s", size, row);
    expect(normal.rules).toEqual(["sideways"]);
    expect(normal.failures[0]).toContain("div.segments");
    expect(normal.failures[0]).toContain("200 %");
    expect(evaluate("s", zoomed, row).failures).toEqual([]);
  });
}

// The page never scrolls sideways beyond 1 px; sidewaysExempt skips a region, never the page or a marker value.
function pageTests(raw: Raws, sizeOf: Sizes): void {
  const size = sizeOf("360x640");

  test("QG-U8 US-QS-15 the page never scrolls sideways beyond 1 px, and a marked region does not excuse it", () => {
    expect(evaluate("s", size, raw({ scrollWidth: 361 })).failures).toEqual([]);
    const page = evaluate(
      "s",
      size,
      raw({ scrollWidth: 374, hEl: "table", sideways: [box("div.tabs", "tabs")] }),
    );
    expect(page.pageX).toBe(1.04);
    expect(page.rules).toEqual(["sideways"]);
    expect(page.failures[0]).toContain("page 1.04");
    expect(page.failures[0]).toContain("table");
  });

  test("QG-U8 US-QS-15 sidewaysExempt skips a region, not the page and not a marker value", () => {
    expect(evaluate("s", size, raw({ sideways: [box("div", null)] }), true).failures).toEqual([]);
    const page = evaluate("s", size, raw({ scrollWidth: 400 }), true);
    expect(page.rules).toEqual(["sideways"]);
    const bad = evaluate("s", size, raw({ markers: [{ el: "div.x", value: "grid" }] }), true);
    expect(bad.rules).toEqual(["marker"]);
  });
}

// A marker names its kind (a missing or unknown value fails by name), and the baseline lists a known sideways failure.
function markerTests(raw: Raws, sizeOf: Sizes): void {
  const size = sizeOf("360x640");
  const zoomed = sizeOf("360x640@200%");

  test("QG-U8 US-QS-15 a marker with an unknown value fails by name, with the screen, the size and the element", () => {
    const unknown = raw({ markers: [{ el: "div.grid", value: "grid" }] });
    const r = evaluate("s", size, unknown);
    expect(r.rules).toEqual(["marker"]);
    expect(r.failures[0]).toContain("div.grid");
    expect(r.failures[0]).toContain('"grid"');
    const named = judgeScreen([r], { maxEntries: 0, entries: [] });
    expect(named[0]).toContain("s at 360x640");
    expect(named[0]).toContain("div.grid");
  });

  test("QG-U8 US-QS-15 a marker without a value fails by name, at every size", () => {
    const missing = raw({ markers: [{ el: "div.rowless", value: "" }] });
    for (const s of [size, zoomed]) {
      const r = evaluate("s", s, missing);
      expect(r.rules, s.name).toEqual(["marker"]);
      expect(r.failures[0], s.name).toContain("div.rowless");
      expect(r.failures[0], s.name).toContain("without a value");
    }
  });

  test("QG-U8 US-QS-15 the baseline lists a known sideways failure, reports a new one and a fixed one", () => {
    const failing = evaluate(
      "s",
      size,
      raw({ sideways: [box("div.hand", null)], scrollWidth: 400 }),
    );
    const listed = buildBaseline([failing]);
    expect(listed.entries[0]).toMatchObject({ pageX: 1.11, innerX: 1.3, rules: ["sideways"] });
    expect(judgeScreen([failing], listed)).toEqual([]);
    const marker = evaluate("s", size, raw({ markers: [{ el: "div.x", value: "grid" }] }));
    expect(judgeScreen([marker], listed)[0]).toContain("new failure (marker)");
    const fixed = evaluate("s", size, raw({}));
    expect(judgeScreen([fixed], listed)[0]).toContain("fits now");
  });
}

export function sidewaysSelfTests(raw: Raws, sizeOf: Sizes): void {
  test.describe("QG-U8 US-QS-15 self-test: sideways scroll and its markers", () => {
    regionTests(raw, sizeOf);
    pageTests(raw, sizeOf);
    markerTests(raw, sizeOf);
  });
}
