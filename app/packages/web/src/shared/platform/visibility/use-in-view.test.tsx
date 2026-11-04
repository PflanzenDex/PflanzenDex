// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInView } from "./use-in-view";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Probe() {
  const [ref, inView] = useInView<HTMLSpanElement>();
  return <span ref={ref}>{inView ? "in view" : "held back"}</span>;
}

/** A stand-in for `IntersectionObserver`: the test decides when the element comes into view. */
class FakeObserver {
  static instances: FakeObserver[] = [];
  observed: Element | null = null;
  disconnected = false;
  constructor(readonly callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }
  observe(element: Element) {
    this.observed = element;
  }
  disconnect() {
    this.disconnected = true;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
  get root() {
    return null;
  }
  get rootMargin() {
    return "";
  }
  get thresholds() {
    return [];
  }
}

describe("NFR-12 pictures load when they come near the viewport", () => {
  it("NFR-12 without IntersectionObserver (jsdom, old browsers) the element counts as in view at once", () => {
    render(<Probe />);
    expect(screen.getByText("in view")).toBeTruthy();
  });

  it("NFR-12 with IntersectionObserver the element is held back until it intersects, then stays in view and the observer lets go", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    render(<Probe />);
    expect(screen.getByText("held back")).toBeTruthy();
    const [observer] = FakeObserver.instances;
    expect(observer?.observed).toBe(screen.getByText("held back"));
    act(() => {
      observer?.callback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      );
    });
    expect(screen.getByText("held back")).toBeTruthy();
    act(() => {
      observer?.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      );
    });
    expect(screen.getByText("in view")).toBeTruthy();
    expect(observer?.disconnected).toBe(true);
  });
});
