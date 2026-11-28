// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkFocusRings } from "./focus-ring.play";

// US-QS-15 (issue 2647): the measures of the focus-ring play, run against boxes and styles this test sets (jsdom has no layout; the
// browser run of the stories judges real ones).
type Box = { left: number; top: number; width: number; height: number };
type Look = Partial<
  Record<
    "overflowX" | "overflowY" | "boxShadow" | "outlineStyle" | "outlineWidth" | "outlineOffset",
    string
  >
>;

const NO_LOOK: Look = {
  overflowX: "visible",
  overflowY: "visible",
  boxShadow: "none",
  outlineStyle: "none",
  outlineWidth: "0px",
  outlineOffset: "0px",
};
/** The ring of `ring-2 ring-inset`, and the one of `ring-2 ring-offset-2` that reaches 4 px out. */
const INSET = "rgb(0, 102, 204) 0px 0px 0px 2px inset";
const OUTSIDE = "rgb(255, 255, 255) 0px 0px 0px 2px, rgb(0, 102, 204) 0px 0px 0px 4px";
/** The rule of `tokens.css` in forced colors with an inset and an outer outline. */
const FORCED_INSET =
  "@media (forced-colors: active) { :focus-visible { outline: 2px solid Highlight; outline-offset: -2px; } }";
const FORCED_OUTSIDE =
  "@media (forced-colors: active) { :focus-visible { outline: 2px solid Highlight; outline-offset: 2px; } }";

const boxes = new Map<Element, Box>();
const looks = new Map<Element, Look>();

const rect = (b: Box) =>
  ({ ...b, right: b.left + b.width, bottom: b.top + b.height, x: b.left, y: b.top }) as DOMRect;

/**
 * A list that clips (`ul`, 360 x 200 px at 0, 0, with the overflow of `clip`) holding one row (`li`, overflow hidden, as the group
 * rows) with a link; the link stands `inset` px inside the row and the list on every side, so a ring that reaches `inset` px out just fits.
 */
function build(
  link: Look,
  clip: Look = { overflowX: "auto", overflowY: "auto" },
  inset = 0,
  rowClip: Look = { overflowX: "hidden", overflowY: "hidden" },
): HTMLElement {
  const canvas = document.createElement("div");
  const list = document.createElement("ul");
  const row = document.createElement("li");
  const target = document.createElement("a");
  target.href = "#pflanze";
  target.textContent = "Clip";
  row.append(target);
  list.append(row);
  canvas.append(list);
  document.body.append(canvas);
  boxes.set(list, { left: 0, top: 0, width: 360, height: 200 });
  boxes.set(row, { left: 0, top: 0, width: 360, height: 76 });
  boxes.set(target, {
    left: inset,
    top: inset,
    width: 360 - 2 * inset,
    height: 76 - 2 * inset,
  });
  for (const [element, height] of [
    [list, 200],
    [row, 76],
  ] as const) {
    Object.defineProperty(element, "clientWidth", { value: 360 });
    Object.defineProperty(element, "clientHeight", { value: height });
  }
  looks.set(list, clip);
  looks.set(row, rowClip);
  looks.set(target, link);
  return canvas;
}

/** The style sheet of the page: the rules `css` holds (a story's browser has the sheet of `tokens.css`). */
function sheet(css: string): void {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
}

type FakeAnimation = {
  effect: { getComputedTiming: () => { iterations: number } };
  finished: Promise<unknown>;
};

/** An animation whose `finished` promise is made when the play asks for it (a rejection made earlier would be unhandled). */
const animation = (finished: () => Promise<unknown>, iterations = 1): FakeAnimation => ({
  effect: { getComputedTiming: () => ({ iterations }) },
  get finished() {
    return finished();
  },
});

/** The animations that `element` runs: the others run none. */
function animate(element: Element, list: FakeAnimation[]): void {
  vi.spyOn(Element.prototype, "getAnimations").mockImplementation(function (this: Element) {
    return (this === element ? list : []) as unknown as Animation[];
  });
}

beforeEach(() => {
  // jsdom has no animations: the stub says that none is running; a test gives an element its own.
  Element.prototype.getAnimations = () => [];
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return rect(boxes.get(this) ?? { left: 0, top: 0, width: 0, height: 0 });
  });
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
    return (boxes.has(this) ? [rect(boxes.get(this) as Box)] : []) as unknown as DOMRectList;
  });
  vi.spyOn(globalThis, "getComputedStyle").mockImplementation(
    (element: Element) => ({ ...NO_LOOK, ...looks.get(element) }) as unknown as CSSStyleDeclaration,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
  boxes.clear();
  looks.clear();
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe("US-QS-15 · the focus-ring play measures (issue 2647)", () => {
  it("US-QS-15 without layout (jsdom) the play checks only that the story shows a control", async () => {
    const canvas = document.createElement("div");
    canvas.innerHTML = '<a href="#a">Clip</a>';
    document.body.append(canvas);
    await expect(checkFocusRings(canvas)).resolves.toBeUndefined();
    await expect(checkFocusRings(document.createElement("div"))).rejects.toThrow(
      /shows no control/,
    );
  });

  it("US-QS-15 an inset ring and an inset forced-colors outline in a clipping list pass, flush with its edges", async () => {
    sheet(FORCED_INSET);
    await expect(checkFocusRings(build({ boxShadow: INSET }))).resolves.toBeUndefined();
  });

  it("US-QS-15 a ring outside the box fails where the list clips it", async () => {
    sheet(FORCED_INSET);
    await expect(checkFocusRings(build({ boxShadow: OUTSIDE }))).rejects.toThrow(
      /the focus ring of a\.? "Clip" runs 4 px past the left edge of li, which clips it/,
    );
  });

  it("US-QS-15 a ring outside the box passes where the list leaves room for it", async () => {
    sheet(FORCED_INSET);
    await expect(
      checkFocusRings(build({ boxShadow: OUTSIDE }, undefined, 4)),
    ).resolves.toBeUndefined();
  });

  it("US-QS-15 a ring that reaches further than the room fails by the missing pixels", async () => {
    sheet(FORCED_INSET);
    await expect(checkFocusRings(build({ boxShadow: OUTSIDE }, undefined, 3))).rejects.toThrow(
      /runs 1 px past the left edge/,
    );
  });

  it("US-QS-15 an outline of the page counts with its offset and width", async () => {
    sheet(FORCED_INSET);
    const outline: Look = { outlineStyle: "solid", outlineWidth: "2px", outlineOffset: "2px" };
    await expect(checkFocusRings(build(outline))).rejects.toThrow(/the focus ring of a/);
    document.body.replaceChildren();
    boxes.clear();
    await expect(checkFocusRings(build(outline, undefined, 4))).resolves.toBeUndefined();
  });

  it("US-QS-15 the forced-colors rule is read from the style sheet: an outline outside the box fails in a clipping list", async () => {
    sheet(FORCED_OUTSIDE);
    await expect(checkFocusRings(build({ boxShadow: INSET }))).rejects.toThrow(
      /the forced-colors outline of a\.? "Clip" runs 4 px past the left edge/,
    );
  });

  it("US-QS-15 the forced-colors rule is read in its longhand form too, and a media rule of another kind is ignored", async () => {
    sheet(
      "@media (prefers-color-scheme: dark) { :focus-visible { outline: 2px solid red; outline-offset: 6px; } } " +
        "@media (forced-colors: active) { :focus-visible { outline-width: 2px; outline-offset: -2px; } }",
    );
    await expect(checkFocusRings(build({ boxShadow: INSET }))).resolves.toBeUndefined();
  });

  it("US-QS-15 a page without the forced-colors rule fails, whatever the box says", async () => {
    sheet(".a { color: red; } @media (forced-colors: active) { .b { outline: 2px solid red; } }");
    await expect(checkFocusRings(build({ boxShadow: INSET }))).rejects.toThrow(
      /rule of forced colors for :focus-visible/,
    );
  });

  it("US-QS-15 a style sheet that the page may not read does not hide the rule of another one", async () => {
    sheet(FORCED_INSET);
    const real = Array.from(document.styleSheets);
    const closed = {
      get cssRules(): CSSRuleList {
        throw new DOMException("closed", "SecurityError");
      },
    };
    vi.spyOn(document, "styleSheets", "get").mockReturnValue([
      closed,
      ...real,
    ] as unknown as StyleSheetList);
    await expect(checkFocusRings(build({ boxShadow: INSET }))).resolves.toBeUndefined();
  });

  it("US-QS-15 a control without a ring fails: a measure of nothing proves nothing", async () => {
    sheet(FORCED_INSET);
    await expect(checkFocusRings(build({}))).rejects.toThrow(/shows no focus ring/);
  });

  it("US-QS-15 a shadow with an offset or a blur is no ring, so an elevation shadow does not count", async () => {
    sheet(FORCED_INSET);
    const look = {
      boxShadow: `rgba(0, 0, 0, 0.1) 0px 4px 6px 0px, rgba(0, 0, 0, 0.1) 0px 0px 8px 4px, ${INSET}`,
    };
    await expect(checkFocusRings(build(look))).resolves.toBeUndefined();
  });

  it("US-QS-15 a list that clips one axis cuts the ring on that axis only", async () => {
    sheet(FORCED_INSET);
    const scrolls = { overflowX: "visible", overflowY: "auto" };
    // Nothing clips sideways, so the first side to fail is the top: the ring has no room above the link.
    await expect(
      checkFocusRings(build({ boxShadow: OUTSIDE }, scrolls, 0, scrolls)),
    ).rejects.toThrow(/past the top edge of li/);
    // With room above and below (the link stands 4 px inside) the ring fits, flush at the sides as it is.
    const canvas = build({ boxShadow: OUTSIDE }, scrolls, 4, scrolls);
    boxes.set(canvas.querySelector("a") as Element, { left: 0, top: 4, width: 360, height: 68 });
    await expect(checkFocusRings(canvas)).resolves.toBeUndefined();
  });

  it("US-QS-15 a control that does not take the focus fails", async () => {
    sheet(FORCED_INSET);
    const canvas = build({ boxShadow: INSET });
    canvas.querySelector("a")?.removeAttribute("href");
    await expect(checkFocusRings(canvas, "a")).rejects.toThrow(/did not take the focus/);
  });
  it("US-QS-15 a ring that comes in a transition (reduced motion: 1 ms) is read after the transition, not before it (conformance run, issue 2647)", async () => {
    sheet(FORCED_INSET);
    const canvas = build({});
    const link = canvas.querySelector("a") as Element;
    // The style is the one from before the focus until the transition of the link has finished (a link has `transition-property: all`).
    let over = false;
    animate(link, [
      animation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              over = true;
              resolve(undefined);
            }, 60),
          ),
      ),
    ]);
    vi.spyOn(globalThis, "getComputedStyle").mockImplementation((element: Element) => {
      const shadow = element === link ? { boxShadow: over ? OUTSIDE : "none" } : {};
      return { ...NO_LOOK, ...looks.get(element), ...shadow } as unknown as CSSStyleDeclaration;
    });
    // The ring that the transition ends in reaches 4 px out and the link stands at the edge: it fails on that ring, not on "no ring".
    await expect(checkFocusRings(canvas)).rejects.toThrow(/the focus ring of a.* runs 4 px past/);
  });

  it("US-QS-15 an endless animation is not waited for, and a cancelled transition does not fail the play", async () => {
    sheet(FORCED_INSET);
    const canvas = build({ boxShadow: INSET });
    animate(canvas.querySelector("a") as Element, [
      animation(() => new Promise(() => undefined), Infinity),
      animation(() => Promise.reject(new Error("cancelled"))),
    ]);
    await expect(checkFocusRings(canvas)).resolves.toBeUndefined();
  });

  it("US-QS-15 a transition that does not end is judged as the ring stands after the settle time", async () => {
    sheet(FORCED_INSET);
    const canvas = build({ boxShadow: INSET });
    animate(canvas.querySelector("a") as Element, [animation(() => new Promise(() => undefined))]);
    await expect(checkFocusRings(canvas)).resolves.toBeUndefined();
  }, 5000);
});
