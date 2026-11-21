import { expect } from "@playwright/test";
import { test } from "../../../support/display/one-screen/sign-in";
import {
  evaluate,
  type First,
  type Raw,
  type Size,
  type Spot,
} from "../../../support/display/one-screen/judge";

// Self-test of the first-screen rule of the one-screen gate (issue 1854, QG-U8, US-QS-15): pure, no browser. Below 768 px
// only a view with a list and the Heute frame may scroll vertically; every phone view shows its page title, the first rows
// and the primary action in the window at load, not under a fixed bar. At 200 % text the title is whole and the first row
// starts in the first screen; the primary action is not looked at. Registered from one-screen.spec.ts, the only spec the
// project runs.

/** A box in the window of 360x640; with a `bar` the first screen ends at 584 px there, else at the window's 640 px. */
export const spot = (top: number, bottom: number, el: string, bar = ""): Spot => ({
  ...{ top, bottom, el, bar, limit: bar ? 584 : 640 },
});

/** A phone view whose title, two rows and primary action are all in the first screen of 360x640. */
export const goodFirst = (): First => ({
  title: spot(16, 48, "h1 Heute"),
  rows: [spot(60, 120, "li.row-1"), spot(130, 190, "li.row-2")],
  action: spot(560, 604, "button.bg-primary Speichern"),
  heute: false,
});

export type Raws = (over: Partial<Raw>) => Raw;
export type Sizes = (name: string) => Size;

/** The window at 768x1024 or 1024x768 with a page that fits unless `over` says otherwise. */
const wideRaw = (raw: Raws, size: Size, over: Partial<Raw>): Raw =>
  raw({
    ...{ innerHeight: size.height, scrollHeight: size.height },
    ...{ innerWidth: size.width, scrollWidth: size.width, first: null },
    ...over,
  });

function scrollTests(raw: Raws, sizeOf: Sizes): void {
  const [phone, zoomed, tablet] = ["360x640", "360x640@200%", "768x1024"].map(sizeOf) as [
    Size,
    Size,
    Size,
  ];
  test("QG-U8 US-QS-15 a phone list may scroll: page 1.8 with its first screen in the window passes", () => {
    const list = { scrollHeight: 1152, region: { scrollHeight: 900, clientHeight: 300, el: "ul" } };
    const r = evaluate("s", phone, raw(list));
    expect(r.failures).toEqual([]);
    expect([r.page, r.inner]).toEqual([1.8, 3]);
    expect(evaluate("s", zoomed, raw({ ...list, scrollHeight: 2112 })).failures).toEqual([]);
    const big = sizeOf("390x844");
    expect(evaluate("s", big, raw({ ...list, innerHeight: 844 })).failures).toEqual([]);
  });

  test("QG-U8 US-QS-15 the same page fails from 768 px, with the same 1 px tolerance as before", () => {
    const fits = { scrollHeight: 1025 };
    expect(evaluate("s", tablet, wideRaw(raw, tablet, fits)).failures).toEqual([]);
    const tall = wideRaw(raw, tablet, { scrollHeight: 1843, pageEl: "ul.list" });
    expect(evaluate("s", tablet, tall).failures[0]).toContain("page 1.80");
    expect(evaluate("s", tablet, tall).failures[0]).toContain("ul.list");
    const landscape = sizeOf("1024x768");
    const wide = wideRaw(raw, landscape, { scrollHeight: 1382 });
    expect(evaluate("s", landscape, wide).failures[0]).toContain("page 1.80");
    const region = { scrollHeight: 900, clientHeight: 300, el: "div.tabs" };
    const inner = evaluate("s", tablet, wideRaw(raw, tablet, { region }));
    expect(inner.failures[0]).toContain("inner 3.00");
  });

  test("QG-U8 US-QS-15 sideways scroll still fails at 360 px, and the 2560 px cap is unchanged", () => {
    expect(evaluate("s", phone, raw({ scrollWidth: 400, hEl: "table" })).failures[0]).toContain(
      "page sideways",
    );
    const regionX = { scrollWidth: 468, clientWidth: 360, el: "div.chips" };
    expect(evaluate("s", phone, raw({ regionX })).failures[0]).toContain("inner sideways");
    expect(evaluate("s", zoomed, raw({ scrollWidth: 400 })).failures[0]).toContain("sideways");
    const paint = { left: 0, right: 2560, clientWidth: 2560, leftEl: "aside", rightEl: "div" };
    const cap = evaluate("s", sizeOf("2560x1440"), raw({ paint }));
    expect(cap.failures[0]).toContain("cap exceeded");
  });
}

function cutTests(raw: Raws, sizeOf: Sizes): void {
  const phone = sizeOf("360x640");
  const withFirst = (first: Partial<First>) => raw({ first: { ...goodFirst(), ...first } });

  test("QG-U8 US-QS-15 a title under a fixed bar or missing fails and names itself", () => {
    const under = evaluate(
      "s",
      phone,
      withFirst({ title: spot(570, 602, "h1 Heute", "nav.fixed") }),
    );
    expect(under.failures).toHaveLength(1);
    expect(under.failures[0]).toContain("title");
    expect(under.failures[0]).toContain("h1 Heute");
    expect(under.failures[0]).toContain("nav.fixed");
    const gone = evaluate("s", phone, withFirst({ title: null }));
    expect(gone.failures[0]).toContain("no page title");
    const above = withFirst({ title: spot(-20, 12, "h1 Heute") });
    expect(evaluate("s", phone, above).failures).toHaveLength(1);
  });

  test("QG-U8 US-QS-15 two rows are needed at 360x640; a short list needs what it has", () => {
    const cut = { rows: [spot(60, 120, "li.row-1"), spot(540, 600, "li.row-2", "nav.fixed")] };
    const one = evaluate("s", phone, withFirst(cut));
    expect(one.failures).toHaveLength(1);
    expect(one.failures[0]).toContain("li.row-2");
    const single = withFirst({ rows: [spot(60, 120, "li.row-1")] });
    expect(evaluate("s", phone, single).failures).toEqual([]);
    const tall = withFirst({ rows: [spot(60, 900, "li.card")] });
    expect(evaluate("s", phone, tall).failures[0]).toContain("li.card");
  });

  test("QG-U8 US-QS-15 a primary action below the fold fails and names itself", () => {
    const below = withFirst({ action: spot(700, 744, "button.bg-primary Neu") });
    const r = evaluate("s", phone, below);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toContain("primary action");
    expect(r.failures[0]).toContain("button.bg-primary Neu");
  });

  test("QG-U8 US-QS-15 a view without a list and without a primary action passes", () => {
    expect(evaluate("s", phone, withFirst({ rows: [], action: null })).failures).toEqual([]);
  });

  test("QG-U8 US-QS-15 a phone without a measured first screen fails; from 768 px it is not looked at", () => {
    expect(evaluate("s", phone, raw({ first: null })).failures[0]).toContain("not measured");
    const tablet = sizeOf("768x1024");
    expect(evaluate("s", tablet, wideRaw(raw, tablet, {})).failures).toEqual([]);
  });
}

export function firstSelfTests(raw: Raws, sizeOf: Sizes): void {
  test.describe("QG-U8 US-QS-15 self-test: phones scroll, from 768 px nothing changes", () => {
    scrollTests(raw, sizeOf);
  });
  test.describe("QG-U8 US-QS-15 self-test: the first screen of a phone", () => {
    cutTests(raw, sizeOf);
  });
}
