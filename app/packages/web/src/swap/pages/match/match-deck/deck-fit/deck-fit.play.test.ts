// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { texts } from "@/shared/lib/text-rules/texts";
import type { Box } from "@/shared/testing/story-frame/table-measure";
import table from "../../../../swap.de.json";
import { OWNER } from "./deck-fit.frame";
import { judgeDeckFit } from "./deck-fit.play";

// US-QS-15, US-TAU-01 (issue 2637): the measures of the card play, run against the boxes this test sets. jsdom has no layout, so
// the story test returns before the first measure (deck-fit.stories.test.tsx). Here `getBoundingClientRect` and
// `getClientRects` report a box for each element and the scroll sizes are set on the elements; the browser run of the
// conformance judges the real boxes.

const t = texts(table);
const ZERO: Box = { top: 0, left: 0, right: 0, bottom: 0 };

const boxes = new Map<Element, Box>();
/** False: the elements report no client rects, as in jsdom (no layout). */
let laidOut = true;

const rect = (box: Box) =>
  ({
    ...box,
    x: box.left,
    y: box.top,
    width: box.right - box.left,
    height: box.bottom - box.top,
  }) as DOMRect;

const at = (top: number, bottom: number): Box => ({ top, left: 0, right: 360, bottom });

const sizeOf = (element: Element, scrollHeight: number, clientHeight: number) => {
  Object.defineProperty(element, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(element, "clientHeight", { value: clientHeight, configurable: true });
};

type Deck = {
  canvas: HTMLElement;
  frame: HTMLElement;
  card: HTMLElement;
  name: HTMLElement;
  byline: HTMLElement;
  /** The buttons "Ablehnen", "Später" and "Anfragen" in the order of the row. */
  buttons: HTMLButtonElement[];
  no: HTMLButtonElement;
  later: HTMLButtonElement;
  yes: HTMLButtonElement;
};

function button(label: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.setAttribute("aria-label", `${label}: Echte Aloe von Ben`);
  return element;
}

/**
 * The deck as the play reads it, in a frame 640 px high: the card from 68 to 344 px with its name and its byline, the three
 * decision buttons from 377 to 425 px below it. The default boxes and sizes pass the play at the normal text size: the frame
 * does not scroll and 33 px lie between the card and the buttons. `scrolls` makes the frame the one of 200 % text: its content
 * is higher than its box, and the buttons stand where 200 % text puts them.
 */
function deck(scrolls = false): Deck {
  const canvas = document.createElement("div");
  const frame = document.createElement("div");
  const card = document.createElement("article");
  const name = document.createElement("h2");
  const byline = document.createElement("p");
  const [no, later, yes] = [t("stamp.no"), t("stamp.later"), t("stamp.yes")].map(button) as [
    HTMLButtonElement,
    HTMLButtonElement,
    HTMLButtonElement,
  ];
  const buttons = [no, later, yes];
  frame.setAttribute("data-fit-fill", "");
  card.setAttribute("aria-labelledby", "match-title");
  name.id = "match-title";
  byline.textContent = t("card.byline", { name: OWNER });
  card.append(name, byline);
  frame.append(card, ...buttons);
  canvas.append(frame);
  document.body.append(canvas);
  boxes.set(frame, at(0, 640));
  boxes.set(card, at(68, 344));
  boxes.set(name, at(183, 210));
  boxes.set(byline, at(238, 258));
  for (const element of buttons) boxes.set(element, at(377, 425));
  sizeOf(card, 276, 276);
  if (scrolls) sizeOf(frame, 1177, 496);
  else sizeOf(frame, 568, 568);
  return { canvas, frame, card, name, byline, buttons, no, later, yes };
}

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return rect(boxes.get(this) ?? ZERO);
  });
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
    const box = boxes.get(this);
    return (laidOut && box ? [rect(box)] : []) as unknown as DOMRectList;
  });
  // jsdom has no `scrollIntoView`: the stub leaves every box where it is.
  Element.prototype.scrollIntoView = vi.fn();
  // jsdom loads no fonts: `settle` waits for `document.fonts.ready` and two animation frames, which run at once here.
  Object.defineProperty(document, "fonts", {
    value: { ready: Promise.resolve() },
    configurable: true,
  });
  vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
    frame(0);
    return 0;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "fonts");
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  boxes.clear();
  laidOut = true;
  document.body.replaceChildren();
});

describe("US-QS-15 · US-TAU-01 · the card of the match deck: the play measures", () => {
  it("US-QS-15 without layout (jsdom) the play returns before its first measure", async () => {
    laidOut = false;
    const { canvas } = deck();
    await expect(judgeDeckFit(canvas, "large")).resolves.toBeUndefined();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("US-QS-15 normal text passes: the card fills the frame, the buttons stand below it, nothing scrolls", async () => {
    const { canvas } = deck();
    await expect(judgeDeckFit(canvas, "normal")).resolves.toBeUndefined();
  });

  it("US-QS-15 normal text: every button scrolls into view", async () => {
    const { canvas, buttons } = deck();
    await judgeDeckFit(canvas, "normal");
    const scrolled = vi.mocked(Element.prototype.scrollIntoView);
    expect(scrolled).toHaveBeenCalledTimes(3);
    expect(scrolled.mock.instances).toEqual(buttons);
    expect(scrolled).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("US-QS-15 US-TAU-01 200 % text passes: the card keeps its content, the buttons follow it, the frame scrolls", async () => {
    const { canvas, card, name, byline, buttons } = deck(true);
    boxes.set(card, at(92, 647.5));
    boxes.set(name, at(180, 220));
    boxes.set(byline, at(250, 290));
    sizeOf(card, 555, 555);
    // The buttons stand one under the other below the card, out of the frame until the frame scrolls to them.
    buttons.forEach((button, at_) => boxes.set(button, at(696.5 + at_ * 64, 744.5 + at_ * 64)));
    vi.mocked(Element.prototype.scrollIntoView).mockImplementation(function (this: Element) {
      boxes.set(this, at(100, 148));
    });
    await expect(judgeDeckFit(canvas, "large")).resolves.toBeUndefined();
  });

  it("US-TAU-01 200 % text: a card squeezed to 32 px fails", async () => {
    const { canvas, card } = deck(true);
    boxes.set(card, at(68, 100));
    await expect(judgeDeckFit(canvas, "large")).rejects.toThrow(
      "the card is at least 150 px high: it is 32 px (text large)",
    );
  });

  it("US-TAU-01 a card whose content is higher than its box fails", async () => {
    const { canvas, card } = deck();
    sizeOf(card, 555, 276);
    await expect(judgeDeckFit(canvas, "normal")).rejects.toThrow(
      "the card is as high as its content: 555 px of content in 276 px",
    );
  });

  it("US-TAU-01 a card that is 1 px short of its content counts as whole (sub-pixel rounding)", async () => {
    const { canvas, card } = deck();
    sizeOf(card, 277, 276);
    await expect(judgeDeckFit(canvas, "normal")).resolves.toBeUndefined();
  });

  it("US-TAU-01 the name below the card fails", async () => {
    const { canvas, name } = deck();
    boxes.set(name, at(350, 380));
    await expect(judgeDeckFit(canvas, "normal")).rejects.toThrow(
      "the name is inside the card: it spans 350 to 380 px, the card 68 to 344 px",
    );
  });

  it("US-TAU-01 the byline above the card fails", async () => {
    const { canvas, byline } = deck();
    boxes.set(byline, at(40, 60));
    await expect(judgeDeckFit(canvas, "normal")).rejects.toThrow(
      "the byline is inside the card: it spans 40 to 60 px, the card 68 to 344 px",
    );
  });

  it("US-QS-15 US-TAU-01 a button over the card fails: the row lies on the card of a collapsed wrapper", async () => {
    const { canvas, no } = deck(true);
    boxes.set(no, at(141, 189));
    await expect(judgeDeckFit(canvas, "large")).rejects.toThrow(
      "the button Ablehnen is below the card: it starts at 141 px, the card spans 68 to 344 px",
    );
  });

  it("US-QS-15 a button 1 px over the card edge counts as below it (sub-pixel rounding)", async () => {
    const { canvas, yes } = deck();
    boxes.set(yes, at(343.5, 391.5));
    await expect(judgeDeckFit(canvas, "normal")).resolves.toBeUndefined();
  });

  it("US-QS-15 a button that stays outside the frame after it scrolls fails", async () => {
    const { canvas, later } = deck(true);
    boxes.set(later, at(700, 748));
    await expect(judgeDeckFit(canvas, "large")).rejects.toThrow(
      "the button Später is reachable: scrolled into view it spans 700 to 748 px, the frame 0 to 640 px (text large)",
    );
  });

  it("US-QS-15 a button above the frame after it scrolls fails", async () => {
    const { canvas, yes } = deck();
    vi.mocked(Element.prototype.scrollIntoView).mockImplementation(function (this: Element) {
      if (this === yes) boxes.set(this, at(-60, -12));
    });
    await expect(judgeDeckFit(canvas, "normal")).rejects.toThrow(
      "the button Anfragen is reachable: scrolled into view it spans -60 to -12 px, the frame 0 to 640 px (text normal)",
    );
  });

  it("US-QS-15 200 % text: a frame that does not scroll fails (the content would not need it)", async () => {
    const { canvas, frame } = deck(true);
    sizeOf(frame, 496, 496);
    await expect(judgeDeckFit(canvas, "large")).rejects.toThrow(
      "at 200 % text the frame scrolls: 496 px of content in 496 px",
    );
  });

  it("US-QS-15 normal text: a frame that scrolls fails (one screen)", async () => {
    const { canvas, frame } = deck();
    sizeOf(frame, 700, 568);
    await expect(judgeDeckFit(canvas, "normal")).rejects.toThrow(
      "the frame does not scroll at the normal size: 700 px of content in 568 px",
    );
  });

  it("US-QS-15 normal text: a card that leaves 60 px above the buttons does not take the free height", async () => {
    const { canvas, card } = deck();
    boxes.set(card, at(68, 317));
    await expect(judgeDeckFit(canvas, "normal")).rejects.toThrow(
      "the card takes the free height: 60 px lie between the card and the buttons (at most 40)",
    );
  });

  it.each([
    ["the card of the deck", (d: Deck) => d.card.remove()],
    ["the button Ablehnen", (d: Deck) => d.no.remove()],
    ["the name of the card", (d: Deck) => d.name.remove()],
    ["the byline of the card", (d: Deck) => d.byline.remove()],
    ["the frame of the page", (d: Deck) => d.frame.removeAttribute("data-fit-fill")],
  ])("US-QS-15 missing %s: the play names it and fails", async (what, remove) => {
    const d = deck();
    remove(d);
    await expect(judgeDeckFit(d.canvas, "normal")).rejects.toThrow(`play: ${what} is missing`);
  });
});
