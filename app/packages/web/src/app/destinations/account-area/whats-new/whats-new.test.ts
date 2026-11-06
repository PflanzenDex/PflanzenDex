// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import news from "@/news/news.de.json";
import { NEWS_LINES, markNewsSeen, unseenNow, unseenOf } from "./whats-new";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("US-DEV-06 the changelog lines", () => {
  it("US-DEV-06 are the unreleased lines of news.de.json, in the file's order (newest first)", () => {
    expect(NEWS_LINES).toEqual(news.unreleased);
    expect(NEWS_LINES[0]).toBe(news.unreleased[0]);
  });
});

describe("US-DEV-06 unseen lines per device", () => {
  it("US-DEV-06 a first visit shows nothing and records the current count", () => {
    expect(unseenNow(10)).toBe(0);
    // The count is recorded: the next visit counts only what came after it.
    expect(unseenNow(13)).toBe(3);
  });

  it("US-DEV-06 the unseen lines are the first total minus seen after a previous visit", () => {
    markNewsSeen(7);
    expect(unseenNow(10)).toBe(3);
  });

  it("US-DEV-06 nothing is unseen when the count did not grow", () => {
    markNewsSeen(10);
    expect(unseenNow(10)).toBe(0);
  });

  it("US-DEV-06 a stored count above the total (a release cut the list) makes every remaining line new", () => {
    markNewsSeen(50);
    expect(unseenNow(4)).toBe(4);
    expect(unseenOf(4, 50)).toBe(4);
  });

  it("US-DEV-06 a corrupt stored value counts as a first visit", () => {
    window.localStorage.setItem("pflanzendex.news-seen", "viele");
    expect(unseenNow(10)).toBe(0);
    expect(unseenNow(12)).toBe(2);
  });

  it("US-DEV-06 storage that throws shows nothing and does not throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => unseenNow(10)).not.toThrow();
    expect(unseenNow(10)).toBe(0);
    expect(markNewsSeen(10)).toBe(false);
  });
});
