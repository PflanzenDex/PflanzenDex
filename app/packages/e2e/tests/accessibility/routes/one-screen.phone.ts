import { expect } from "@playwright/test";
import { test } from "../../../support/display/one-screen/sign-in";
import {
  evaluate,
  type First,
  type Layer,
  type Raw,
  type Size,
} from "../../../support/display/one-screen/judge";
import { goodFirst, spot, type Raws, type Sizes } from "./one-screen.first";

// Self-test of a layer under the scroll model (US-QS-15, DS-59, DS-60, QG-U8; issue 2417): pure, no browser. A layer (a sheet,
// a dialog or the pane) is judged by its own box: it must not reach beyond the window, and a region inside it scrolls only when
// it is marked `data-scroll-region`. The page behind an open layer is not judged (issue 1854). Registered from one-screen.spec.ts.

function layerTests(raw: Raws, sizeOf: Sizes): void {
  const [phone, zoomed] = ["360x640", "360x640@200%"].map(sizeOf) as [Size, Size];
  const sheet = (over: Partial<Layer>): Partial<Raw> => ({
    first: { ...goodFirst(), layer: { reach: 640, el: "div[role=dialog]", ...over } as Layer },
  });
  const inside = { el: "div.overflow-y-auto", marked: false, scroll: 900, client: 500 };

  test("QG-U8 US-QS-15 a layer over a page of 2.0 passes when the layer fits: the page behind it is not judged", () => {
    expect(evaluate("s", phone, raw({ ...sheet({}), scrollHeight: 1280 })).failures).toEqual([]);
  });

  test("QG-U8 US-QS-15 a layer whose region inside it is not marked fails and names the region", () => {
    const r = evaluate("s", phone, raw({ ...sheet({}), scrollers: [inside] }));
    expect(r.rules).toEqual(["frame"]);
    expect(r.failures[0]).toContain("div.overflow-y-auto");
    expect(r.failures[0]).toContain("data-scroll-region");
    const marked = { ...inside, marked: true };
    expect(evaluate("s", phone, raw({ ...sheet({}), scrollers: [marked] })).failures).toEqual([]);
    expect(evaluate("s", zoomed, raw({ ...sheet({}), scrollers: [inside] })).failures).toEqual([]);
  });

  test("QG-U8 US-QS-15 a layer whose box reaches beyond the window fails and names itself", () => {
    const r = evaluate("s", phone, raw(sheet({ reach: 700, el: "div#sheet" })));
    expect(r.rules).toEqual(["frame"]);
    expect(r.failures[0]).toContain("layer 1.09");
    expect(r.failures[0]).toContain("div#sheet");
    expect(evaluate("s", phone, raw(sheet({ reach: 641 }))).failures).toEqual([]);
  });

  test("QG-U8 US-QS-15 a layer with a marked list scrolls inside its region and its title stays whole", () => {
    const marked = { ...inside, marked: true };
    const r = evaluate("s", phone, raw({ ...sheet({ reach: 640 }), scrollers: [marked] }));
    expect(r.failures).toEqual([]);
    const cut: First = { ...goodFirst(), title: spot(570, 602, "h1 Dialog", "nav.fixed") };
    expect(evaluate("s", phone, raw({ first: { ...cut, layer: null } })).rules).toEqual(["title"]);
  });
}

export function layerSelfTests(raw: Raws, sizeOf: Sizes): void {
  test.describe("QG-U8 US-QS-15 self-test: a layer is judged by its box and its marked regions", () => {
    layerTests(raw, sizeOf);
  });
}
