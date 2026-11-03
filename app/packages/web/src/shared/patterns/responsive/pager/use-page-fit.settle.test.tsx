// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePageFit } from "./use-page-fit";

// Issue 1188: in CI the Pflanzen list at 360x640 with 200 % text measured a page size that changed the rows it measured
// (A rows gave room for B, B rows for A), and the layout effect re-rendered until React stopped with "Maximum update
// depth exceeded"; the error boundary then replaced the page. Here the region's height depends on the rendered rows.

const ROW = 100;
/** Region height per number of rendered rows: 3 rows leave room for 5, 5 rows for 3. */
let regionFor: (rows: number) => number = () => 0;
let fontSize = "16px";

function Rows() {
  const list = useRef<HTMLUListElement>(null);
  const fit = usePageFit(list, true);
  const rows = fit?.size ?? 3;
  return (
    <ul ref={list} aria-label="Pflanzen">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}>Pflanze {i + 1}</li>
      ))}
    </ul>
  );
}

beforeEach(() => {
  fontSize = "16px";
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const height =
      this.tagName === "UL" ? regionFor(this.children.length) : this.tagName === "LI" ? ROW : 0;
    return {
      height,
      width: 320,
      top: 0,
      left: 0,
      right: 320,
      bottom: height,
      x: 0,
      y: 0,
    } as DOMRect;
  });
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
    const style = real(el);
    return el === document.documentElement
      ? ({
          ...style,
          fontSize,
          getPropertyValue: style.getPropertyValue.bind(style),
        } as CSSStyleDeclaration)
      : style;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("US-QS-19 page size fills the free height of the region", () => {
  it("US-QS-19 · issue 1188 a size that changes its own rows settles on the smaller one instead of looping", () => {
    regionFor = (rows) => (rows <= 3 ? 5 * ROW : 3 * ROW);
    render(<Rows />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("US-QS-19 · issue 1188 the cap ends when the text size changes, so a larger region fills again", () => {
    regionFor = (rows) => (rows <= 3 ? 5 * ROW : 3 * ROW);
    const { rerender } = render(<Rows />);
    regionFor = () => 6 * ROW;
    rerender(<Rows />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fontSize = "32px";
    rerender(<Rows />);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
  });

  it("US-QS-19 · issue 1188 a steady region still takes the size that fits it", () => {
    regionFor = () => 4 * ROW;
    render(<Rows />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });
});
