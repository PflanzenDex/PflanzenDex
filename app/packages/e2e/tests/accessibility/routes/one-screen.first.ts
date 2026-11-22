import { expect } from "@playwright/test";
import { test } from "../../../support/display/one-screen/sign-in";
import {
  evaluate,
  type First,
  type Raw,
  type Scroller,
  type Size,
  type Spot,
} from "../../../support/display/one-screen/judge";

// Self-test of the frame rule of the one-screen gate (US-QS-15, DS-58, DS-61, QG-U8; issue 2417): pure, no browser. The frame
// (top bar, navigation, primary action) does not scroll, the page never does, and only elements marked `data-scroll-region`
// scroll. The page title and the primary action are whole at load and while a region is scrolled. At 200 % text and in a
// window lower than 30 rem the frame may scroll (WCAG 1.4.10, DS-25). Registered from one-screen.spec.ts.

/** A box in the window of 360x640; with a `bar` the first screen ends at 584 px there, else at the window's 640 px. */
export const spot = (top: number, bottom: number, el: string, bar = ""): Spot => ({
  ...{ top, bottom, el, bar, limit: bar ? 584 : 640 },
});

/** A view whose title and primary action are whole at load and after its region scrolled to the end. */
export const goodFirst = (): First => ({
  title: spot(16, 48, "h1 Heute"),
  action: spot(560, 604, "button.bg-primary Speichern"),
  scrolled: {
    el: "main",
    title: spot(16, 48, "h1 Heute"),
    action: spot(560, 604, "button.bg-primary Speichern"),
  },
  layer: null,
});

export type Raws = (over: Partial<Raw>) => Raw;
export type Sizes = (name: string) => Size;

const FIXED_SIZES = ["360x640", "390x844", "768x1024", "1024x768", "1920x1080"];
const unmarked = (el: string, scroll = 1200, client = 600): Scroller => ({
  el,
  marked: false,
  scroll,
  client,
});
const marked = (el: string, scroll = 1200, client = 600): Scroller => ({
  el,
  marked: true,
  scroll,
  client,
});

/** The window at the size of `sizeOf` with its height (the page of a tablet or desktop window is taller than a phone's). */
const sized = (raw: Raws, size: Size, over: Partial<Raw> = {}): Raw =>
  raw({
    innerHeight: size.height,
    scrollHeight: size.height,
    innerWidth: size.width,
    scrollWidth: size.width,
    ...over,
  });

function frameTests(raw: Raws, sizeOf: Sizes): void {
  const phone = sizeOf("360x640");

  test("QG-U8 US-QS-15 the frame does not scroll: a page one pixel too tall fits, a page 1.5 windows tall fails and names its lowest element", () => {
    expect(evaluate("s", phone, raw({ scrollHeight: 641 })).failures).toEqual([]);
    const tall = evaluate("s", phone, raw({ scrollHeight: 960, pageEl: "ul.list" }));
    expect(tall.page).toBe(1.5);
    expect(tall.rules).toEqual(["frame"]);
    expect(tall.failures[0]).toContain("page 1.50");
    expect(tall.failures[0]).toContain("ul.list");
  });

  test("QG-U8 US-QS-15 a fixture page that scrolls its frame fails at every fixed size and names the element", () => {
    for (const name of FIXED_SIZES) {
      const size = sizeOf(name);
      const r = evaluate("s", size, sized(raw, size, { scrollers: [unmarked("main.flex-1")] }));
      expect(r.rules, name).toEqual(["frame"]);
      expect(r.failures[0], name).toContain("main.flex-1");
      expect(r.failures[0], name).toContain("data-scroll-region");
    }
  });

  test("QG-U8 US-QS-15 only a marked data-scroll-region scrolls: a marked list may scroll at every fixed size", () => {
    for (const name of FIXED_SIZES) {
      const size = sizeOf(name);
      const r = evaluate("s", size, sized(raw, size, { scrollers: [marked("ul.list")] }));
      expect(r.failures, name).toEqual([]);
      expect(r.inner, name).toBe(1);
    }
  });

  test("QG-U8 US-QS-15 at 200 % text the page and its frame may scroll (WCAG 1.4.10), and the title stays whole", () => {
    const zoomed = sizeOf("360x640@200%");
    const r = evaluate(
      "s",
      zoomed,
      raw({ rem: 32, scrollHeight: 1600, scrollers: [unmarked("main")] }),
    );
    expect(r.failures).toEqual([]);
    const cut = raw({
      rem: 32,
      first: { ...goodFirst(), title: spot(570, 602, "h1 Heute", "nav.fixed") },
    });
    expect(evaluate("s", zoomed, cut).rules).toEqual(["title"]);
  });

  test("QG-U8 US-QS-15 a window lower than 30 rem (DS-25) may scroll its frame; a taller one keeps the frame fixed", () => {
    expect(evaluate("s", phone, raw({ rem: 32, scrollHeight: 1200 })).failures).toEqual([]);
    expect(evaluate("s", phone, raw({ rem: 16, scrollHeight: 1200 })).rules).toEqual(["frame"]);
  });
}

function titleTests(raw: Raws, sizeOf: Sizes): void {
  const phone = sizeOf("360x640");
  const withFirst = (first: Partial<First>) => raw({ first: { ...goodFirst(), ...first } });

  test("QG-U8 US-QS-15 the title is whole at load and stays in the window while a region scrolls", () => {
    expect(evaluate("s", phone, withFirst({ title: null })).failures[0]).toContain("no page title");
    const under = evaluate(
      "s",
      phone,
      withFirst({ title: spot(570, 602, "h1 Heute", "nav.fixed") }),
    );
    expect(under.rules).toEqual(["title"]);
    expect(under.failures[0]).toContain("title is cut");
    expect(under.failures[0]).toContain("nav.fixed");
    const moved = evaluate(
      "s",
      phone,
      withFirst({
        scrolled: {
          el: "main",
          title: spot(-120, -88, "h1 Heute"),
          action: spot(560, 604, "button.bg-primary Speichern"),
        },
      }),
    );
    expect(moved.rules).toEqual(["title"]);
    expect(moved.failures[0]).toContain("while main scrolls");
    expect(moved.failures[0]).toContain("h1 Heute");
  });
}

function actionTests(raw: Raws, sizeOf: Sizes): void {
  const phone = sizeOf("360x640");
  const withFirst = (first: Partial<First>) => raw({ first: { ...goodFirst(), ...first } });

  test("QG-U8 US-QS-15 the primary action is whole at load and stays in the window while a region scrolls", () => {
    const below = evaluate(
      "s",
      phone,
      withFirst({ action: spot(700, 744, "button.bg-primary Neu") }),
    );
    expect(below.rules).toEqual(["action"]);
    expect(below.failures[0]).toContain("primary action is cut");
    expect(below.failures[0]).toContain("button.bg-primary Neu");
    const away = evaluate(
      "s",
      phone,
      withFirst({
        scrolled: {
          el: "ul.list",
          title: spot(16, 48, "h1 Heute"),
          action: spot(-300, -256, "button.bg-primary Neu"),
        },
      }),
    );
    expect(away.rules).toEqual(["action"]);
    expect(away.failures[0]).toContain("scrolls away while ul.list scrolls");
  });

  test("QG-U8 US-QS-15 at 200 % text only the title is judged; a view without a primary action or a region passes", () => {
    const zoomed = sizeOf("360x640@200%");
    const far = raw({
      rem: 32,
      first: { ...goodFirst(), action: spot(1160, 1208, "button.bg-primary Speichern") },
    });
    expect(evaluate("s", zoomed, far).failures).toEqual([]);
    const plain = withFirst({ action: null, scrolled: null });
    expect(evaluate("s", phone, plain).failures).toEqual([]);
  });

  test("QG-U8 US-QS-15 a view whose first screen is not measured fails at every size, 768 px and above too", () => {
    expect(evaluate("s", phone, raw({ first: null })).failures[0]).toContain("not measured");
    const tablet = sizeOf("768x1024");
    expect(evaluate("s", tablet, sized(raw, tablet, { first: null })).failures[0]).toContain(
      "not measured",
    );
  });
}

export function firstSelfTests(raw: Raws, sizeOf: Sizes): void {
  test.describe("QG-U8 US-QS-15 self-test: the frame does not scroll, only marked regions do", () => {
    frameTests(raw, sizeOf);
  });
  test.describe("QG-U8 US-QS-15 self-test: the title and the primary action stay in the window", () => {
    titleTests(raw, sizeOf);
    actionTests(raw, sizeOf);
  });
}
