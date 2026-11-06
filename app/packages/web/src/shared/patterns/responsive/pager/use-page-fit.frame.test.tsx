// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePageFit } from "./use-page-fit";

// Issue 1413: the Sammlung's list is held at the height of its rows by ancestors that are sized by their content, so its
// own height is not the free height. The frame (`data-fit-fill`, or a layer's pane) overflows by what does not fit: the
// page size must follow the frame, and it must follow a shorter window on resize.

const ROW = 100;
/** What sits in the frame besides the list, the header and the pager bar (a model, not measured). */
const OTHER = 200;
let frameHeight = 500;
let headerHeight = OTHER;
let observed: Element[] = [];
let callbacks: (() => void)[] = [];

const isFrame = (el: Element) =>
  el.hasAttribute("data-fit-fill") || el.hasAttribute("data-layer-pane");

function Rows({ start }: { start: number }) {
  const list = useRef<HTMLUListElement>(null);
  const fit = usePageFit(list, true);
  const rows = fit?.size ?? start;
  return (
    <ul ref={list} aria-label="Pflanzen">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}>Pflanze {i + 1}</li>
      ))}
    </ul>
  );
}

/** A list in a frame: `fill` is a view that fills the height, `pane` a layer's pane, `none` no frame (a sheet). */
function Page({ kind, start = 6 }: { kind: "fill" | "pane" | "none"; start?: number }) {
  const list = (
    <div>
      <Rows start={start} />
    </div>
  );
  if (kind === "pane") return <aside data-layer-pane="">{list}</aside>;
  if (kind === "fill") return <div data-fit-fill="">{list}</div>;
  return <section>{list}</section>;
}

beforeEach(() => {
  frameHeight = 500;
  headerHeight = OTHER;
  observed = [];
  callbacks = [];
  // The list is as tall as its rows, and each row is ROW px.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const height =
      this.tagName === "UL" ? this.children.length * ROW : this.tagName === "LI" ? ROW : 0;
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
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
    return isFrame(this) ? frameHeight : 0;
  });
  // The frame's content is the header and the rows: it is never shorter than its box.
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
    if (!isFrame(this)) return 0;
    const rows = this.querySelector("ul")?.children.length ?? 0;
    return Math.max(frameHeight, headerHeight + rows * ROW);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const pageSize = () => screen.getAllByRole("listitem").length;

describe("FR-BES-23 page size follows the free height of the frame", () => {
  it("FR-BES-23 a list held by its content takes the rows that fit the frame, not the rows it holds", () => {
    // Six rows (600 px) overflow a 500 px frame by 300 px, so the free height is 300 px: three rows fit.
    render(<Page kind="fill" />);
    expect(pageSize()).toBe(3);
  });

  it("FR-BES-23 a frame with room keeps the list's own height, as before", () => {
    frameHeight = 1000;
    render(<Page kind="fill" />);
    expect(pageSize()).toBe(6);
  });

  it("FR-BES-23 at a large text size the list still shows one row, the least a page shows", () => {
    // The header alone is taller than the frame: none of the list fits, one row is still shown.
    frameHeight = 300;
    headerHeight = 400;
    render(<Page kind="fill" />);
    expect(pageSize()).toBe(1);
  });

  it("FR-BES-23 a layer's pane is the frame of its list", () => {
    render(<Page kind="pane" />);
    expect(pageSize()).toBe(3);
  });

  it("FR-BES-23 a list without a frame (a sheet, the document) keeps its own height, as before", () => {
    render(<Page kind="none" />);
    expect(pageSize()).toBe(6);
  });
});

describe("FR-BES-23 page size follows a shorter window on resize", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          callbacks.push(callback);
        }
        observe(el: Element) {
          observed.push(el);
        }
        disconnect() {
          // The test replays the callbacks itself, so nothing is left to disconnect.
        }
      },
    );
  });

  it("FR-BES-23 the frame is observed, so a shorter window re-measures the list", () => {
    frameHeight = 1000;
    render(<Page kind="fill" />);
    expect(pageSize()).toBe(6);
    expect(observed.some((el) => el.hasAttribute("data-fit-fill"))).toBe(true);
    frameHeight = 500;
    act(() => {
      for (const callback of callbacks) callback();
    });
    expect(pageSize()).toBe(3);
  });
});
