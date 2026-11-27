// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkMetaLine, waitForText200 } from "./object-row.play";

// US-QS-32: the measures of the play helpers, run against boxes this test sets (jsdom has no layout; the browser run judges real ones).
const COLUMN = { left: 0, right: 100, width: 100 };
type Box = { top: number; left: number; width: number; height: number };
const NBSP = String.fromCharCode(160);
const boxes = new Map<Element, Box>();

const rect = (b: Box) =>
  ({ ...b, right: b.left + b.width, bottom: b.top + b.height, x: b.left, y: b.top }) as DOMRect;

/** A meta line of parts; `box(i)` gives the box of part i. The line is 100 px wide and its lines are 20 px high. */
function build(texts: string[], box: (i: number) => Box, scrollWidth = 100): HTMLElement {
  const canvas = document.createElement("div");
  const line = document.createElement("p");
  line.setAttribute("data-row-meta", "");
  line.style.lineHeight = "20px";
  Object.defineProperty(line, "scrollWidth", { value: scrollWidth });
  Object.defineProperty(line, "clientWidth", { value: 100 });
  line.getClientRects = () => [rect(box(0))] as unknown as DOMRectList;
  boxes.set(line, { top: 0, ...COLUMN, height: 40 });
  texts.forEach((text, i) => {
    const part = document.createElement("span");
    part.setAttribute("data-meta-part", "");
    part.textContent = i < texts.length - 1 ? `${text}${NBSP}·` : text;
    boxes.set(part, box(i));
    line.append(part);
  });
  canvas.append(line);
  document.body.append(canvas);
  return canvas;
}

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const b = boxes.get(this);
    return rect(b ?? { top: 0, left: 0, width: 0, height: 0 });
  });
  Range.prototype.getBoundingClientRect = () => rect({ top: 0, left: 0, width: 5, height: 20 });
});

afterEach(() => {
  vi.restoreAllMocks();
  boxes.clear();
  document.body.replaceChildren();
  document.documentElement.style.fontSize = "";
});

describe("US-QS-32 · the meta line play measures", () => {
  it("US-QS-32 none: parts that fit and stand on two lines pass", () => {
    const canvas = build(["Zone 3", "Pflege"], (i) => ({
      top: i * 20,
      left: 0,
      width: 50,
      height: 20,
    }));
    expect(() => checkMetaLine(canvas, "none")).not.toThrow();
  });

  it("US-QS-32 none: one single line fails, the story shows no wrap between parts", () => {
    const canvas = build(["Zone 3", "Pflege"], (i) => ({
      top: 0,
      left: i * 50,
      width: 50,
      height: 20,
    }));
    expect(() => checkMetaLine(canvas, "none")).toThrow(/one line/);
  });

  it("US-QS-32 none: a part that breaks inside fails", () => {
    const canvas = build(["Zone 3", "Pflege"], (i) => ({
      top: i * 40,
      left: 0,
      width: 60,
      height: 40,
    }));
    expect(() => checkMetaLine(canvas, "none")).toThrow(/break/);
  });

  it("US-QS-32 some: a part as wide as the column that wraps passes", () => {
    const canvas = build(["Zone 3", "Wechsel"], (i) => ({
      top: i * 20,
      left: 0,
      width: i ? 100 : 50,
      height: i ? 40 : 20,
    }));
    expect(() => checkMetaLine(canvas, "some")).not.toThrow();
  });

  it("US-QS-32 some: no wide part fails", () => {
    const canvas = build(["Zone 3", "Pflege"], (i) => ({
      top: i * 20,
      left: 0,
      width: 50,
      height: 20,
    }));
    expect(() => checkMetaLine(canvas, "some")).toThrow(/no part wraps/);
  });

  it("US-QS-32 a line that runs sideways fails", () => {
    const canvas = build(
      ["Zone 3", "Pflege"],
      (i) => ({ top: i * 20, left: 0, width: 50, height: 20 }),
      140,
    );
    expect(() => checkMetaLine(canvas, "none")).toThrow(/sideways/);
  });

  it("US-QS-32 a dot that starts a line fails", () => {
    const canvas = build(["Zone 3", "Pflege"], (i) => ({
      top: i * 20,
      left: 0,
      width: 50,
      height: 20,
    }));
    let n = 0;
    Range.prototype.getBoundingClientRect = () =>
      rect({ top: n++ === 0 ? 0 : 20, left: 0, width: 5, height: 20 });
    expect(() => checkMetaLine(canvas, "none")).toThrow(/starts a line/);
  });

  it("US-QS-32 waitForText200 waits until the root font size is 200 %", async () => {
    const canvas = build(["Zone 3", "Pflege"], (i) => ({
      top: i * 20,
      left: 0,
      width: 50,
      height: 20,
    }));
    document.documentElement.style.fontSize = "32px";
    await expect(waitForText200(canvas)).resolves.toBeUndefined();
  });
});
