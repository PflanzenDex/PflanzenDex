// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { check, hasLayout, must, waitUntil } from "./story-play";

describe("P-B the helpers of the play functions (issue 2432)", () => {
  it("US-QS-15 check passes on a holding condition and names what failed otherwise", () => {
    expect(() => check(true, "x")).not.toThrow();
    expect(() => check(false, "the strip is missing")).toThrow("play: the strip is missing");
  });

  it("US-QS-15 must returns the element and names a missing one", () => {
    const el = document.createElement("div");
    expect(must(el, "the list")).toBe(el);
    expect(() => must(null, "the list")).toThrow("play: the list is missing");
    expect(() => must(undefined, "the strip")).toThrow("play: the strip is missing");
  });

  it("US-QS-15 waitUntil resolves when the condition holds and names what did not happen within the deadline", async () => {
    let n = 0;
    await waitUntil(() => ++n > 2, "the third poll");
    await expect(waitUntil(() => false, "the list scrolls", 60)).rejects.toThrow(
      "play: the list scrolls did not happen within 60 ms",
    );
  });

  it("US-QS-15 hasLayout is false in jsdom, which reports no client rects", () => {
    expect(hasLayout(document.createElement("div"))).toBe(false);
  });
});
