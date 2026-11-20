// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthFrame } from "./auth-frame";
import table from "../views.de.json";

/** The rendered frame as DOM, so the tests read it the way the user sees it (structure and attributes, not the markup text). */
function renderFrame(): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = renderToString(
    <AuthFrame>
      <p>Inhalt</p>
    </AuthFrame>,
  );
  return host;
}

/** The band of the drawing and the value lines: the one region of the frame. */
function bandOf(host: HTMLElement): HTMLElement {
  const band = host.querySelector<HTMLElement>('[role="region"]');
  if (!band) throw new Error("the frame has no region");
  return band;
}

/** Whether an element is the band (the only region of the frame). */
const isBand = (el: Element) => el.getAttribute("role") === "region";

/** The px the band's content needs and the px its box shows: a model of the layout, read by the stubbed measures. */
let contentHeight = 100;
let boxHeight = 200;

/** Every ResizeObserver the frame creates: the test replays its callback as the layout would, and sees what it watches. */
class FakeResizeObserver {
  readonly observed: Element[] = [];
  readonly disconnect = vi.fn();
  readonly callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
    observers.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
}
let observers: FakeResizeObserver[] = [];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

/** Renders the frame into the document, as the app does (react-dom/client, effects run). */
function mount(): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <AuthFrame>
        <p>Inhalt</p>
      </AuthFrame>,
    );
  });
  const band = host.querySelector<HTMLElement>('[role="region"]');
  if (!band) throw new Error("the frame has no region");
  return band;
}

function unmount() {
  if (root) act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
}

/** Replays the observers' callbacks, as a resize of the window or the text size would. */
function resize(next: { content?: number; box?: number }) {
  if (next.content !== undefined) contentHeight = next.content;
  if (next.box !== undefined) boxHeight = next.box;
  act(() => {
    for (const observer of observers) observer.callback();
  });
}

beforeEach(() => {
  contentHeight = 100;
  boxHeight = 200;
  observers = [];
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
    return isBand(this) ? contentHeight : 0;
  });
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
    return isBand(this) ? boxHeight : 0;
  });
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
  unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

describe("auth frame value lines (US-QS-14)", () => {
  it("US-QS-14 the three value lines render on a phone too, and their list carries no hidden class (owner decision Q-156)", () => {
    const host = renderFrame();
    const lines = [...host.querySelectorAll("li")].map((li) => li.textContent);
    expect(lines).toEqual([
      "Sammle deine Pflanzen wie Karten",
      "Miss Wachstum gegen deine eigene Geschichte",
      "Tausche Stecklinge mit Freunden",
    ]);
    const list = host.querySelector("ul");
    expect(list?.classList.contains("list-none")).toBe(true);
    expect(list?.classList.contains("hidden")).toBe(false);
  });

  it("US-QS-14 the band holds the drawing and the value lines, and on a phone it is at most 36 % of the window high and scrolls inside itself (owner decision 2026-11-14)", () => {
    const band = bandOf(renderFrame());
    expect(band.querySelector("svg")).not.toBeNull();
    expect(band.querySelector("ul")).not.toBeNull();
    for (const name of ["max-h-[36dvh]", "overflow-y-auto", "overscroll-contain"]) {
      expect(band.classList.contains(name), name).toBe(true);
    }
  });

  it("US-QS-14 from md (768 px) the band has no height limit and no own scroll, as before", () => {
    const band = bandOf(renderFrame());
    for (const name of ["md:max-h-none", "md:overflow-visible", "md:justify-center"]) {
      expect(band.classList.contains(name), name).toBe(true);
    }
  });

  it("US-QS-14 the band names itself with a German text from the message table on every size and shows its focus ring inside its box", () => {
    const band = bandOf(renderFrame());
    expect(band.getAttribute("aria-label")).toBe(table["frame.region"]);
    expect(band.getAttribute("aria-label")?.length ?? 0).toBeGreaterThan(0);
    for (const name of [
      "focus-visible:ring-inset",
      "focus-visible:ring-2",
      "focus-visible:ring-ring",
    ]) {
      expect(band.classList.contains(name), name).toBe(true);
    }
  });

  it("US-QS-14 the markup alone makes no tab stop: the band is one only once it has been measured (issue 2124)", () => {
    const band = bandOf(renderFrame());
    expect(band.hasAttribute("tabindex")).toBe(false);
  });
});

describe("auth frame tab stop follows the scroll (US-QS-14, issue 2124)", () => {
  it("US-QS-14 an overflowing band is a tab stop: it has tabindex 0 and takes focus", () => {
    contentHeight = 400;
    boxHeight = 200;
    const band = mount();
    expect(band.getAttribute("tabindex")).toBe("0");
    act(() => band.focus());
    expect(document.activeElement).toBe(band);
  });

  it("US-QS-14 a band that fits has no tabindex and takes no focus (issue 2124)", () => {
    contentHeight = 100;
    boxHeight = 200;
    const band = mount();
    expect(band.hasAttribute("tabindex")).toBe(false);
    act(() => band.focus());
    expect(document.activeElement).not.toBe(band);
  });

  it("US-QS-14 the band becomes a tab stop when its content overflows and leaves being one when it fits again", () => {
    contentHeight = 100;
    boxHeight = 200;
    const band = mount();
    expect(band.hasAttribute("tabindex")).toBe(false);
    resize({ box: 50 });
    expect(band.getAttribute("tabindex")).toBe("0");
    resize({ box: 200 });
    expect(band.hasAttribute("tabindex")).toBe(false);
  });

  it("US-QS-14 the band watches itself and its drawing and value lines, so a change of any of them re-measures it", () => {
    const band = mount();
    const [observer] = observers;
    expect(observer).toBeDefined();
    expect(observer?.observed).toContain(band);
    expect(observer?.observed.some((el) => el.tagName.toLowerCase() === "svg")).toBe(true);
    expect(observer?.observed.some((el) => el.tagName.toLowerCase() === "ul")).toBe(true);
  });

  it("US-QS-14 without ResizeObserver the band is measured once, when it is mounted (issue 2124)", () => {
    vi.unstubAllGlobals();
    contentHeight = 400;
    boxHeight = 200;
    const band = mount();
    expect(band.getAttribute("tabindex")).toBe("0");
  });

  it("US-QS-14 the observer is disconnected when the frame leaves the page", () => {
    mount();
    const [observer] = observers;
    expect(observer?.disconnect).not.toHaveBeenCalled();
    unmount();
    expect(observer?.disconnect).toHaveBeenCalledTimes(1);
  });

  it("US-QS-14 the region role and the German name stay on a band that fits, as well as on one that overflows", () => {
    contentHeight = 100;
    const band = mount();
    expect(band.getAttribute("role")).toBe("region");
    expect(band.getAttribute("aria-label")).toBe(table["frame.region"]);
    resize({ content: 400, box: 200 });
    expect(band.getAttribute("role")).toBe("region");
    expect(band.getAttribute("aria-label")).toBe(table["frame.region"]);
  });
});
