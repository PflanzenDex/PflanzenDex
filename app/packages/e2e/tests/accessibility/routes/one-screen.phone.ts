import { expect } from "@playwright/test";
import { test } from "../../../support/display/one-screen/sign-in";
import {
  evaluate,
  type First,
  type Layer,
  type Size,
} from "../../../support/display/one-screen/judge";
import { goodFirst, spot, type Raws, type Sizes } from "./one-screen.first";

// Self-test of what only a phone view may do (issue 1854, QG-U8, US-QS-15): pure, no browser. Below 768 px only a view with
// a list and the Heute frame may scroll vertically, every other view keeps the old vertical rule; a layer without a list is
// judged by its own box and regions, not by the page behind it. At 200 % text only the title is checked. Registered from
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

function layerTests(raw: Raws, sizeOf: Sizes): void {
  const [phone, zoomed] = ["360x640", "360x640@200%"].map(sizeOf) as [Size, Size];
  const sheet = (over: Partial<Layer>, rows: First["rows"] = []) => ({
    first: {
      ...{ ...goodFirst(), rows, action: null },
      layer: { reach: 640, el: "div[role=dialog]", region: null, ...over },
    },
  });
  const inside = { scrollHeight: 900, clientHeight: 500, el: "div.overflow-y-auto" };

  test("QG-U8 US-QS-15 a layer without a list over a page of 2.0 passes when the layer fits", () => {
    const behind = {
      scrollHeight: 1280,
      region: { scrollHeight: 900, clientHeight: 300, el: "ul" },
    };
    expect(evaluate("s", phone, raw({ ...sheet({}), ...behind })).failures).toEqual([]);
    expect(evaluate("s", phone, raw({ ...sheet({}), scrollHeight: 1280 })).failures).toEqual([]);
  });

  test("QG-U8 US-QS-15 the same layer with a region inside it over 1.00 at 360x640 fails", () => {
    const r = evaluate("s", phone, raw({ ...sheet({ region: inside }), scrollHeight: 1280 }));
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toContain("inner 1.80");
    expect(r.failures[0]).toContain("div.overflow-y-auto");
    expect(evaluate("s", zoomed, raw(sheet({ region: inside }))).failures).toEqual([]);
  });

  test("QG-U8 US-QS-15 a layer whose box reaches beyond the window fails and names itself", () => {
    const r = evaluate("s", phone, raw(sheet({ reach: 700, el: "div#sheet" })));
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toContain("layer 1.09");
    expect(r.failures[0]).toContain("div#sheet");
    expect(evaluate("s", phone, raw(sheet({ reach: 641 }))).failures).toEqual([]);
  });

  test("QG-U8 US-QS-15 a layer with a list scrolls freely", () => {
    const rows = goodFirst().rows;
    expect(evaluate("s", phone, raw(sheet({ region: inside, reach: 900 }, rows))).failures).toEqual(
      [],
    );
  });
}

function zoomedTests(raw: Raws, sizeOf: Sizes): void {
  const [phone, zoomed] = ["360x640", "360x640@200%"].map(sizeOf) as [Size, Size];
  const withFirst = (first: Partial<First>) => raw({ first: { ...goodFirst(), ...first } });

  test("QG-U8 US-QS-15 at 200 % text the title must still stand whole", () => {
    const under = withFirst({ title: spot(570, 602, "h1 Heute", "nav.fixed") });
    expect(evaluate("s", zoomed, under).failures[0]).toContain("title");
    const gone = withFirst({ title: null });
    expect(evaluate("s", zoomed, gone).failures[0]).toContain("no page title");
  });

  test("QG-U8 US-QS-15 at 200 % text no row and no primary action is looked at", () => {
    const rows = [spot(200, 1400, "li.card"), spot(1500, 1600, "li.row-2")];
    const far = withFirst({ rows, action: spot(1160, 1208, "button.bg-primary Speichern") });
    expect(evaluate("s", zoomed, far).failures).toEqual([]);
    const below = withFirst({ rows: [spot(900, 960, "li.row-1", "nav.fixed")] });
    expect(evaluate("s", zoomed, below).failures).toEqual([]);
    expect(evaluate("s", phone, far).failures).toHaveLength(2);
  });
}

export function phoneSelfTests(raw: Raws, sizeOf: Sizes): void {
  test.describe("QG-U8 US-QS-15 self-test: only a list or Heute may scroll on a phone", () => {
    mayScrollTests(raw, sizeOf);
  });
  test.describe("QG-U8 US-QS-15 self-test: a layer is judged by itself, not by the page behind", () => {
    layerTests(raw, sizeOf);
  });
  test.describe("QG-U8 US-QS-15 self-test: the first screen at 200 % text", () => {
    zoomedTests(raw, sizeOf);
  });
}
