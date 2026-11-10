// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SwipeCard } from "./swipe-card";
import type { SwipeDirection } from "./swipe-gesture";

const stamps: Record<SwipeDirection, string> = {
  left: "Nein",
  right: "Ja",
  up: "Später",
  down: "Später",
};

const onSwipe = vi.fn<(d: SwipeDirection) => void>();
const onExited = vi.fn<(d: SwipeDirection) => void>();

/** Cards are 300 px wide in jsdom (no layout): the threshold is 120 px, starting value, assumption. */
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 300,
  });
});

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function ui(extra: Partial<ComponentProps<typeof SwipeCard>> = {}) {
  return (
    <SwipeCard exit={null} stamps={stamps} onSwipe={onSwipe} onExited={onExited} {...extra}>
      <p>Karte</p>
    </SwipeCard>
  );
}

const drag = (from: number, to: number, y = 100) => {
  const el = screen.getByText("Karte");
  fireEvent.pointerDown(el, { clientX: from, clientY: y });
  fireEvent.pointerMove(el, { clientX: to, clientY: y });
  fireEvent.pointerUp(el, { clientX: to, clientY: y });
};

/** The moving layer of the card: its own transform, the parent of the content. */
const moving = () => screen.getByText("Karte").parentElement as HTMLElement;

/** The pose of the moving layer, read from its custom properties (DS-32): x, y and the rotation. */
const poseOf = (el: HTMLElement) => ({
  x: el.style.getPropertyValue("--swipe-x"),
  y: el.style.getPropertyValue("--swipe-y"),
  rotate: el.style.getPropertyValue("--swipe-rotate"),
});
const REST_POSE = { x: "0px", y: "0px", rotate: "0deg" };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  setReducedMotion(false);
  delete (navigator as { vibrate?: unknown }).vibrate;
});

describe("US-ENT-01 a release past the threshold decides, below it cancels", () => {
  it("US-ENT-01 a drag past the threshold decides, a drag below it cancels", () => {
    render(ui());
    drag(200, 50);
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenLastCalledWith("left");
    onSwipe.mockClear();
    drag(200, 180);
    expect(onSwipe).not.toHaveBeenCalled();
    expect(poseOf(moving())).toEqual(REST_POSE);
  });

  it("US-ENT-01 a release that carries no move event still decides from where the pointer went down", () => {
    render(ui());
    const el = screen.getByText("Karte");
    fireEvent.pointerDown(el, { clientX: 200, clientY: 100 });
    fireEvent.pointerUp(el, { clientX: 50, clientY: 100 });
    expect(onSwipe).toHaveBeenCalledWith("left");
  });

  it("US-ENT-01 a tap decides nothing and a click on the content still works", () => {
    const pressed = vi.fn();
    render(
      <SwipeCard exit={null} stamps={stamps} onSwipe={onSwipe} onExited={onExited}>
        <button type="button" onClick={pressed}>
          Mehr
        </button>
      </SwipeCard>,
    );
    const button = screen.getByRole("button", { name: "Mehr" });
    fireEvent.pointerDown(button, { clientX: 100, clientY: 100 });
    fireEvent.pointerUp(button, { clientX: 100, clientY: 100 });
    fireEvent.click(button);
    expect(onSwipe).not.toHaveBeenCalled();
    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it("US-ENT-01 a click that ends a drag does not press the button under the finger", () => {
    const pressed = vi.fn();
    render(
      <SwipeCard exit={null} stamps={stamps} onSwipe={onSwipe} onExited={onExited}>
        <button type="button" onClick={pressed}>
          Mehr
        </button>
      </SwipeCard>,
    );
    const button = screen.getByRole("button", { name: "Mehr" });
    fireEvent.pointerDown(button, { clientX: 200, clientY: 100 });
    fireEvent.pointerMove(button, { clientX: 40, clientY: 100 });
    fireEvent.pointerUp(button, { clientX: 40, clientY: 100 });
    fireEvent.click(button);
    expect(onSwipe).toHaveBeenCalledWith("left");
    expect(pressed).not.toHaveBeenCalled();
  });

  it("US-ENT-01 a vertical drag from the grip is Später, up or down, and the grip keeps scrolling for the text", () => {
    const { container } = render(ui());
    const grip = container.querySelector("[data-grip]") as HTMLElement;
    expect(grip.className).toContain("touch-none");
    fireEvent.pointerDown(grip, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(grip, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(grip, { clientX: 100, clientY: 260 });
    expect(onSwipe).toHaveBeenCalledWith("down");
  });

  it("US-ENT-01 a disabled card takes no gesture", () => {
    render(ui({ disabled: true }));
    drag(200, 50);
    expect(onSwipe).not.toHaveBeenCalled();
  });
});

describe("US-ENT-01 the drag shows the card following the pointer and the stamp before the release", () => {
  it("US-ENT-01 while dragging the card follows the pointer, tilts and shows the stamp of its direction", () => {
    render(ui());
    const el = screen.getByText("Karte");
    fireEvent.pointerDown(el, { clientX: 200, clientY: 100 });
    fireEvent.pointerMove(el, { clientX: 140, clientY: 100 });
    expect(poseOf(moving())).toEqual({ x: "-60px", y: "0px", rotate: "-1.6deg" });
    expect(screen.getByText("Nein").style.getPropertyValue("--stamp-opacity")).toBe("0.5");
    expect(onSwipe).not.toHaveBeenCalled();
  });
});

describe("US-ENT-01 the decision flies the card off and is reported once it has left", () => {
  it("US-ENT-01 a decision flies the card off in its direction and reports it once it has left", () => {
    vi.useFakeTimers();
    const { rerender } = render(ui());
    rerender(ui({ exit: "right" }));
    expect(poseOf(moving()).x).toBe("1024px");
    expect(onExited).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onExited).toHaveBeenCalledTimes(1);
    expect(onExited).toHaveBeenLastCalledWith("right");
  });

  it("US-ENT-01 a swipe and a button hand the same exit to the card, which flies the same way", () => {
    const { rerender } = render(ui());
    drag(200, 50);
    expect(onSwipe).toHaveBeenLastCalledWith("left");
    rerender(ui({ exit: "left" }));
    expect(poseOf(moving())).toEqual({ x: "-1024px", y: "0px", rotate: "-15deg" });
  });

  it("US-ENT-01 a refused decision springs the card back to its place", () => {
    const { rerender } = render(ui());
    rerender(ui({ exit: "right" }));
    rerender(ui({ exit: null }));
    expect(poseOf(moving())).toEqual(REST_POSE);
  });

  it("US-ENT-01 the next card is in place underneath as a blank frame and hidden while the card is in front", () => {
    const { container, rerender } = render(ui({ stacked: true }));
    const under = container.querySelector(".inset-0[aria-hidden='true']") as HTMLElement;
    expect(under).not.toBeNull();
    expect(under.style.getPropertyValue("--under-scale")).toBe("0.95");
    rerender(ui({ exit: "up", stacked: true }));
    expect(under.style.getPropertyValue("--under-scale")).toBe("1");
  });

  it("US-ENT-01 without a next card there is no frame underneath", () => {
    const { container } = render(ui({ stacked: false }));
    expect(container.querySelector(".inset-0[aria-hidden='true']")).toBeNull();
  });
});

describe("NFR-13 reduced motion removes the motion but not the result", () => {
  it("NFR-13 with reduced motion the card does not follow the drag, the stamp still shows the decision and the release decides", () => {
    setReducedMotion(true);
    render(ui());
    const el = screen.getByText("Karte");
    fireEvent.pointerDown(el, { clientX: 200, clientY: 100 });
    fireEvent.pointerMove(el, { clientX: 80, clientY: 100 });
    expect(poseOf(moving())).toEqual(REST_POSE);
    expect(screen.getByText("Nein").style.getPropertyValue("--stamp-opacity")).toBe("1");
    fireEvent.pointerUp(el, { clientX: 80, clientY: 100 });
    expect(onSwipe).toHaveBeenCalledWith("left");
  });

  it("NFR-13 with reduced motion the decision is reported at once, without waiting for a timer", () => {
    setReducedMotion(true);
    const { rerender } = render(ui());
    rerender(ui({ exit: "right" }));
    expect(onExited).toHaveBeenCalledTimes(1);
    expect(onExited).toHaveBeenLastCalledWith("right");
  });
});

describe("US-ENT-01 haptics on a decision, no sound", () => {
  it("US-ENT-01 a decision vibrates once where the browser offers it", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    const { rerender } = render(ui());
    rerender(ui({ exit: "down" }));
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(12);
  });

  it("US-ENT-01 without the vibration API a decision stays silent and still works", () => {
    const { rerender } = render(ui());
    expect(() => rerender(ui({ exit: "right" }))).not.toThrow();
    expect(onExited).not.toHaveBeenCalled();
  });
});

describe("US-ENT-01 the next card underneath shows its content, hidden and not focusable", () => {
  it("US-ENT-01 the content of the next card is rendered under the front card, aria-hidden and inert", () => {
    const { container } = render(
      ui({ stacked: true, under: <button type="button">Nächste Karte</button> }),
    );
    const under = container.querySelector<HTMLElement>(".inset-0[aria-hidden='true']");
    expect(under?.textContent).toContain("Nächste Karte");
    expect(under?.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("button", { name: "Nächste Karte" })).toBeNull();
    expect(screen.getByText("Karte")).toBeTruthy();
  });

  it("US-ENT-01 the content underneath grows to full size while the card leaves, as the blank frame does", () => {
    const { container, rerender } = render(ui({ stacked: true, under: <p>Nächste</p> }));
    const under = container.querySelector<HTMLElement>(".inset-0[aria-hidden='true']");
    expect(under?.style.getPropertyValue("--under-scale")).toBe("0.95");
    rerender(ui({ exit: "up", stacked: true, under: <p>Nächste</p> }));
    expect(under?.style.getPropertyValue("--under-scale")).toBe("1");
  });
});
