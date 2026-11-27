// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { texts } from "@/shared/lib/text-rules/texts";
import type { Box } from "@/shared/testing/story-frame/table-measure";
import table from "../../../../swap.de.json";
import { judgeInfoButton } from "./deck-help.play";

// US-QS-15 (issue 2626): the measures of the info button play, run against the boxes and styles this test sets. jsdom has no
// layout, so the story test returns before the first measure (deck-help.stories.test.tsx). Here `getClientRects` reports a box
// for each element, `getComputedStyle` reports the overflow and the shadow, and the browser run of the conformance judges the
// real boxes.

const LABEL = texts(table)("deck.helpButton");
/** A focus ring of two shadows, colors first as the browser reports them: its reach is 4 px. */
const RING = "rgb(255, 255, 255) 0px 0px 0px 2px, rgb(17, 94, 89) 0px 0px 0px 4px";
const ZERO: Box = { top: 0, left: 0, right: 0, bottom: 0 };

type Style = { overflowX: string; overflowY: string; boxShadow: string };
const PLAIN: Style = { overflowX: "visible", overflowY: "visible", boxShadow: "none" };

const boxes = new Map<Element, Box>();
const styles = new Map<Element, Partial<Style>>();
/** False: the elements report no client rects, as in jsdom (no layout). */
let laidOut = true;
const original = { innerWidth: window.innerWidth, innerHeight: window.innerHeight };

const rect = (box: Box) =>
  ({
    ...box,
    x: box.left,
    y: box.top,
    width: box.right - box.left,
    height: box.bottom - box.top,
  }) as DOMRect;

type Deck = {
  canvas: HTMLElement;
  wrap: HTMLElement;
  counter: HTMLElement;
  button: HTMLButtonElement;
  strip: HTMLElement;
};

/**
 * The deck as the play reads it, on a 360 x 640 px page: a wrap that clips nothing, the row of the counter and the info button
 * (the parent of the button), and the drag strip of the card. The default boxes pass every check: the ring reaches 4 px past
 * the 44 px target, 16 px lie between the ring and the counter, and 12 px between the ring and the card.
 */
function deck(): Deck {
  const canvas = document.createElement("div");
  const wrap = document.createElement("div");
  const row = document.createElement("div");
  const counter = document.createElement("p");
  const button = document.createElement("button");
  const strip = document.createElement("div");
  counter.textContent = "1";
  button.type = "button";
  button.setAttribute("aria-label", LABEL);
  strip.setAttribute("data-grip", "");
  row.append(counter, button);
  wrap.append(row);
  canvas.append(wrap, strip);
  document.body.append(canvas);
  boxes.set(wrap, { top: 0, left: 0, right: 360, bottom: 640 });
  boxes.set(row, { top: 100, left: 0, right: 360, bottom: 144 });
  boxes.set(counter, { top: 110, left: 150, right: 280, bottom: 130 });
  boxes.set(button, { top: 100, left: 300, right: 344, bottom: 144 });
  boxes.set(strip, { top: 160, left: 0, right: 360, bottom: 166 });
  styles.set(button, { boxShadow: RING });
  // jsdom may not know `:focus-visible`: the play waits for the ring, which this spy shows at once.
  vi.spyOn(button, "matches").mockImplementation(
    (selector: string) => selector === ":focus-visible",
  );
  return { canvas, wrap, counter, button, strip };
}

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return rect(boxes.get(this) ?? ZERO);
  });
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
    const box = boxes.get(this);
    return (laidOut && box ? [rect(box)] : []) as unknown as DOMRectList;
  });
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    (element: Element) => ({ ...PLAIN, ...styles.get(element) }) as unknown as CSSStyleDeclaration,
  );
  // jsdom loads no fonts: `settle` waits for `document.fonts.ready` and two animation frames, which run at once here.
  Object.defineProperty(document, "fonts", {
    value: { ready: Promise.resolve() },
    configurable: true,
  });
  vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
    frame(0);
    return 0;
  });
  Object.defineProperty(window, "innerWidth", { value: 360, configurable: true, writable: true });
  Object.defineProperty(window, "innerHeight", { value: 640, configurable: true, writable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "fonts");
  Object.defineProperty(window, "innerWidth", {
    value: original.innerWidth,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: original.innerHeight,
    configurable: true,
    writable: true,
  });
  boxes.clear();
  styles.clear();
  laidOut = true;
  document.body.replaceChildren();
});

describe("US-QS-15 · the info button of the match deck: the play measures", () => {
  it("US-QS-15 without layout (jsdom) the play returns before its first measure", async () => {
    laidOut = false;
    const { canvas, button } = deck();
    await expect(judgeInfoButton(canvas)).resolves.toBeUndefined();
    expect(window.getComputedStyle).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(button);
  });

  it("US-QS-15 passes: the 44 px target and its ring are whole, clear of the counter and the card", async () => {
    const { canvas, button } = deck();
    await expect(judgeInfoButton(canvas)).resolves.toBeUndefined();
    expect(document.activeElement).toBe(button);
  });

  it("US-QS-15 target too small: a 40 x 40 px target fails", async () => {
    const { canvas, button } = deck();
    boxes.set(button, { top: 100, left: 300, right: 340, bottom: 140 });
    await expect(judgeInfoButton(canvas)).rejects.toThrow("it is 40 x 40");
  });

  it("US-QS-15 target too small: a target 44 px wide but 40 px high fails", async () => {
    const { canvas, button } = deck();
    boxes.set(button, { top: 100, left: 300, right: 344, bottom: 140 });
    await expect(judgeInfoButton(canvas)).rejects.toThrow("it is 44 x 40");
  });

  it("US-QS-15 target cut off by a clipping ancestor on the vertical axis (overflowY) fails", async () => {
    const { canvas, wrap } = deck();
    styles.set(wrap, { overflowY: "hidden" });
    boxes.set(wrap, { top: 0, left: 0, right: 360, bottom: 130 });
    await expect(judgeInfoButton(canvas)).rejects.toThrow(
      "the whole target is inside the frame: 14 px are cut off",
    );
  });

  it("US-QS-15 target cut off by a clipping ancestor on the horizontal axis (overflowX) fails", async () => {
    const { canvas, wrap } = deck();
    styles.set(wrap, { overflowX: "auto" });
    boxes.set(wrap, { top: 0, left: 0, right: 320, bottom: 640 });
    await expect(judgeInfoButton(canvas)).rejects.toThrow(
      "the whole target is inside the frame: 24 px are cut off",
    );
  });

  it("US-QS-15 a box cut by less than half a pixel counts as whole (sub-pixel rounding)", async () => {
    const { canvas, button } = deck();
    styles.set(button, { boxShadow: "none" });
    boxes.set(button, { top: -0.4, left: 300, right: 344, bottom: 43.6 });
    await expect(judgeInfoButton(canvas)).resolves.toBeUndefined();
  });

  it("US-QS-15 ring cut off at the top: the widest of several shadows sets its reach", async () => {
    const { canvas, button } = deck();
    styles.set(button, {
      boxShadow: "rgb(255, 255, 255) 0px 0px 0px 2px, rgba(0, 0, 0, 0.5) 2px 3px 4px 1px",
    });
    boxes.set(button, { top: 3, left: 300, right: 344, bottom: 47 });
    await expect(judgeInfoButton(canvas)).rejects.toThrow(
      "the whole focus ring is inside the frame: 5 px are cut off",
    );
  });

  it("US-QS-15 ring cut off on the left: a shadow offset to the left reaches by its offset", async () => {
    const { canvas, button } = deck();
    styles.set(button, { boxShadow: "rgb(0, 0, 0) -6px 0px 0px 0px" });
    boxes.set(button, { top: 100, left: 2, right: 46, bottom: 144 });
    await expect(judgeInfoButton(canvas)).rejects.toThrow(
      "the whole focus ring is inside the frame: 4 px are cut off",
    );
  });

  it("US-QS-15 ring too close to the counter text fails", async () => {
    const { canvas, counter } = deck();
    boxes.set(counter, { top: 110, left: 150, right: 294, bottom: 130 });
    await expect(judgeInfoButton(canvas)).rejects.toThrow(
      "the ring is 4 px clear of the counter text: it is 2",
    );
  });

  it("US-QS-15 ring too close to the card fails", async () => {
    const { canvas, strip } = deck();
    boxes.set(strip, { top: 150, left: 0, right: 360, bottom: 156 });
    await expect(judgeInfoButton(canvas)).rejects.toThrow(
      "the ring is 4 px clear of the card: it is 2",
    );
  });

  it("US-QS-15 missing info button: the play names it and fails", async () => {
    const canvas = document.createElement("div");
    document.body.append(canvas);
    await expect(judgeInfoButton(canvas)).rejects.toThrow(
      "play: the info button of the deck is missing",
    );
  });

  it("US-QS-15 missing counter text: the play names it and fails", async () => {
    const { canvas, counter } = deck();
    counter.remove();
    await expect(judgeInfoButton(canvas)).rejects.toThrow("play: the counter text is missing");
  });

  it("US-QS-15 missing drag strip of the card: the play names it and fails", async () => {
    const { canvas, strip } = deck();
    strip.remove();
    await expect(judgeInfoButton(canvas)).rejects.toThrow(
      "play: the drag strip of the card is missing",
    );
  });
});
