import { expect } from "@playwright/test";
import { test } from "../../../support/display/one-screen/sign-in";
import { evaluate, type First, type Size } from "../../../support/display/one-screen/judge";
import { goodFirst, spot, type Raws, type Sizes } from "./one-screen.first";

// Self-test of what only a phone view may do (issue 1854, QG-U8, US-QS-15): pure, no browser. Below 768 px only a view with
// a list and the Heute frame may scroll vertically, every other view keeps the old vertical rule; at 200 % text the title
// is whole and the first row starts in the first screen, the primary action is not looked at. Registered from
// one-screen.spec.ts next to the self-test of one-screen.first.ts.

function mayScrollTests(raw: Raws, sizeOf: Sizes): void {
  const [phone, big, zoomed] = ["360x640", "390x844", "360x640@200%"].map(sizeOf) as [
    Size,
    Size,
    Size,
  ];
  const none = (heute: boolean) => ({ first: { ...goodFirst(), rows: [], action: null, heute } });
  const region = { scrollHeight: 900, clientHeight: 300, el: "div.form" };

  test("QG-U8 US-QS-15 a phone view without a list keeps the old vertical rule: page 1.3 fails", () => {
    const tall = raw({ ...none(false), scrollHeight: 832, pageEl: "form.long" });
    const r = evaluate("s", phone, tall);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toContain("page 1.30");
    expect(r.failures[0]).toContain("form.long");
    const bigTall = { ...none(false), scrollHeight: 1100, innerHeight: 844 };
    expect(evaluate("s", big, raw(bigTall)).failures[0]).toContain("page 1.30");
    expect(evaluate("s", phone, raw({ ...none(false), region })).failures[0]).toContain("inner");
  });

  test("QG-U8 US-QS-15 at 200 % text a view without a list scrolls in a region, but its page stands", () => {
    expect(evaluate("s", zoomed, raw({ ...none(false), region })).failures).toEqual([]);
    const tall = raw({ ...none(false), scrollHeight: 1100 });
    expect(evaluate("s", zoomed, tall).failures[0]).toContain("page 1.72");
  });

  test("QG-U8 US-QS-15 Heute without rows may scroll at every phone size; a list view may too", () => {
    const heute = { ...none(true), scrollHeight: 832, region };
    expect(evaluate("s", phone, raw(heute)).failures).toEqual([]);
    expect(evaluate("s", zoomed, raw({ ...heute, scrollHeight: 1600 })).failures).toEqual([]);
    const bigHeute = { ...none(true), scrollHeight: 1100, innerHeight: 844 };
    expect(evaluate("s", big, raw(bigHeute)).failures).toEqual([]);
    const listed = raw({ scrollHeight: 832, region });
    expect(evaluate("s", phone, listed).failures).toEqual([]);
  });
}

function zoomedTests(raw: Raws, sizeOf: Sizes): void {
  const zoomed = sizeOf("360x640@200%");
  const withFirst = (first: Partial<First>) => raw({ first: { ...goodFirst(), ...first } });

  test("QG-U8 US-QS-15 at 200 % text the title must still stand whole", () => {
    const under = withFirst({ title: spot(570, 602, "h1 Heute", "nav.fixed") });
    expect(evaluate("s", zoomed, under).failures[0]).toContain("title");
    expect(evaluate("s", zoomed, withFirst({ title: null })).failures[0]).toContain(
      "no page title",
    );
  });

  test("QG-U8 US-QS-15 at 200 % text the first row only has to start in the first screen, even if taller", () => {
    const card = withFirst({ rows: [spot(200, 1400, "li.card")] });
    expect(evaluate("s", zoomed, card).failures).toEqual([]);
    const edge = withFirst({ rows: [spot(570, 700, "li.row-1", "nav.fixed")] });
    expect(evaluate("s", zoomed, edge).failures).toEqual([]);
    const below = withFirst({ rows: [spot(600, 700, "li.row-1", "nav.fixed")] });
    expect(evaluate("s", zoomed, below).failures).toHaveLength(1);
    expect(evaluate("s", zoomed, below).failures[0]).toContain("li.row-1");
    const second = withFirst({ rows: [spot(60, 120, "li.row-1"), spot(700, 760, "li.row-2")] });
    expect(evaluate("s", zoomed, second).failures).toEqual([]);
  });

  test("QG-U8 US-QS-15 at 200 % text the primary action is not looked at", () => {
    const far = withFirst({ action: spot(1160, 1208, "button.bg-primary Speichern") });
    expect(evaluate("s", zoomed, far).failures).toEqual([]);
    expect(evaluate("s", sizeOf("360x640"), far).failures).toHaveLength(1);
  });
}

export function phoneSelfTests(raw: Raws, sizeOf: Sizes): void {
  test.describe("QG-U8 US-QS-15 self-test: only a list or Heute may scroll on a phone", () => {
    mayScrollTests(raw, sizeOf);
  });
  test.describe("QG-U8 US-QS-15 self-test: the first screen at 200 % text", () => {
    zoomedTests(raw, sizeOf);
  });
}
