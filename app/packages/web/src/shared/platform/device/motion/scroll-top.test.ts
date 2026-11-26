// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollToTop } from "./scroll-top";

afterEach(() => {
  vi.restoreAllMocks();
  delete document.documentElement.dataset["motion"];
});

/** A scroll box whose content starts at 100 px and whose target stands 300 px from the top of the screen, scrolled by 40 px. */
function boxes() {
  const scroller = document.createElement("div");
  const target = document.createElement("div");
  vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({ top: 100 } as DOMRect);
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ top: 300 } as DOMRect);
  Object.defineProperty(scroller, "scrollTop", { value: 40, writable: true });
  return { scroller, target };
}

describe("US-QS-15 · US-QS-33 scrollToTop puts a section or an entry at the top of its scroll box", () => {
  it("US-QS-15 scrolls to the place of the target in the content of the box, smoothly", () => {
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    const { scroller, target } = boxes();
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo;
    scrollToTop(scroller, target);
    expect(scrollTo).toHaveBeenCalledWith({ top: 240, behavior: "smooth" });
  });

  it("US-QS-33 with reduced motion by the keeper's choice the box is there at once", () => {
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    document.documentElement.dataset["motion"] = "reduced";
    const { scroller, target } = boxes();
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo;
    scrollToTop(scroller, target);
    expect(scrollTo).toHaveBeenCalledWith({ top: 240, behavior: "auto" });
  });

  it("US-QS-33 with reduced motion by the device the box is there at once", () => {
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    const { scroller, target } = boxes();
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo;
    scrollToTop(scroller, target);
    expect(scrollTo).toHaveBeenCalledWith({ top: 240, behavior: "auto" });
  });

  it("US-QS-15 a drag jumps at once: `instant` is never smooth", () => {
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    const { scroller, target } = boxes();
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo;
    scrollToTop(scroller, target, true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 240, behavior: "auto" });
  });

  it("US-QS-15 a box without `scrollTo` gets its scrollTop set", () => {
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    const { scroller, target } = boxes();
    scroller.scrollTo = undefined as unknown as typeof scroller.scrollTo;
    scrollToTop(scroller, target);
    expect(scroller.scrollTop).toBe(240);
  });
});
