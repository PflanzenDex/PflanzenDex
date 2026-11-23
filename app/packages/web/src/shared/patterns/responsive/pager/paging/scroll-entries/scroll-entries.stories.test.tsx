// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import preview from "../../../../../../../.storybook/preview";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { unmountStoryRuns } from "@/shared/testing/story-teardown/story-teardown";
import * as stories from "./scroll-entries.stories";

setProjectAnnotations([preview]);
const { Loading, EndMarker, Filtered, UnknownCount, RetryRowAt200 } = composeStories(stories);

afterEach(async () => {
  await unmountStoryRuns();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setViewportWidth(360);
});

const rect = (top: number, bottom: number, right = 300) =>
  ({ top, bottom, left: 0, right, width: right, height: bottom - top }) as DOMRect;

type Model = { scrollable?: boolean; buttonTop?: number };

/**
 * The layout of a phone that jsdom lacks: the list is a box of 300 px with rows of 60 px, scrolled by what the play sets;
 * the retry button stands at `buttonTop` below a sentence that ends at 40 px. The plays measure this model, so a model that
 * breaks a rule (a marker that cannot be scrolled into view, a button beside its sentence) must fail the play (P-B).
 */
function layout({ scrollable = true, buttonTop = 48 }: Model = {}) {
  let scrolled = 0;
  const list = (el: Element) => el.tagName === "UL";
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: () => void) {}
      observe() {
        this.callback();
      }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
    return list(this) ? 300 : 0;
  });
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
    return list(this) ? this.children.length * 60 : 0;
  });
  vi.spyOn(Element.prototype, "scrollTop", "get").mockImplementation(() => scrolled);
  vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation(function (
    this: Element,
    to: number,
  ) {
    if (scrollable) scrolled = Math.min(to, this.children.length * 60 - 300);
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const rows = Array.from(this.parentElement?.children ?? []);
    if (list(this)) return rect(0, 300);
    if (this.parentElement && list(this.parentElement)) {
      const at = rows.indexOf(this);
      return rect(at * 60 - scrolled, (at + 1) * 60 - scrolled);
    }
    if (this.tagName === "P" && this.getAttribute("role") === "alert") return rect(0, 40);
    if (this.tagName === "BUTTON") return rect(buttonTop, buttonTop + 44, 200);
    return rect(0, 0, 0);
  });
}

describe("US-QS-15 · SG-LIST-01 the plays of the ScrollEntries stories hold under a model of the layout", () => {
  it("US-QS-15 · SG-LIST-01 the end marker, the filtered marker, the loader and the unknown count pass their plays", async () => {
    layout();
    for (const story of [Loading, EndMarker, Filtered, UnknownCount]) await story.run();
  });

  it("US-QS-15 · SG-LIST-01 the retry row passes its play when the button stands below the sentence", async () => {
    layout();
    await RetryRowAt200.run();
    expect(document.documentElement.style.getPropertyValue("font-size")).toBe("200%");
  });

  it("US-QS-15 · SG-LIST-01 the retry row fails its play at 200 % text when the button stands beside the sentence", async () => {
    layout({ buttonTop: 10 });
    await expect(RetryRowAt200.run()).rejects.toThrow(/stand below the sentence/);
  });

  it("US-QS-15 · SG-LIST-01 the end marker fails its play when the end of the list cannot be scrolled into view", async () => {
    layout({ scrollable: false });
    await expect(EndMarker.run()).rejects.toThrow(/not fully in view/);
  });
});
