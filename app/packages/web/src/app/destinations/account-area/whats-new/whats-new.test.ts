// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import news from "@/news/news.de.json";
import { newsEntries, planRelease } from "./news-lines.mjs";
import { NEWS_COUNT, NEWS_ENTRIES, markNewsSeen, unseenNow, unseenOf } from "./whats-new";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("US-DEV-06 the changelog lines", () => {
  it("US-DEV-06 the unreleased lines of news.de.json come last, in the file's order (newest first)", () => {
    const legacy = NEWS_ENTRIES.slice(NEWS_ENTRIES.length - news.unreleased.length);
    expect(legacy.map((entry) => entry.text)).toEqual(news.unreleased);
    expect(NEWS_ENTRIES[0]?.heading).toEqual({ version: null, date: null });
  });

  it("US-DEV-06 the count is the number of lines in display order", () => {
    expect(NEWS_COUNT).toBe(NEWS_ENTRIES.length);
  });

  it("US-DEV-06 every fragment file of news/unreleased is a line of the list", () => {
    const files = Object.keys(import.meta.glob("../../../../news/unreleased/*.json"));
    expect(NEWS_ENTRIES.length - news.unreleased.length).toBe(files.length);
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

  it("US-DEV-06 a stored count above the total (lines were taken back) makes every remaining line new", () => {
    markNewsSeen(50);
    expect(unseenNow(4)).toBe(4);
    expect(unseenOf(4, 50)).toBe(4);
  });

  it("US-DEV-06 a line moved into a version by a release is not new on this device", () => {
    const before = {
      unreleased: ["Alt A", "Alt B"],
      versions: [{ version: "1.0.0", date: "2026-10-01", lines: ["Vorher"] }],
    };
    const fragments = [{ name: "1490-neu.json", line: "Neu" }];
    markNewsSeen(newsEntries(before, fragments).length);
    const plan = planRelease({ news: before, fragments, version: "1.1.0", date: "2026-11-06" });
    // The release moved the fragment and the unreleased lines into 1.1.0: the list is as long as before, so nothing is new.
    expect(unseenNow(newsEntries(plan.news, []).length)).toBe(0);
  });

  it("US-DEV-06 a fragment added after a release counts as one unseen line", () => {
    const before = {
      unreleased: ["Alt A", "Alt B"],
      versions: [{ version: "1.0.0", date: "2026-10-01", lines: ["Vorher"] }],
    };
    const fragments = [{ name: "1490-neu.json", line: "Neu" }];
    markNewsSeen(newsEntries(before, fragments).length);
    const plan = planRelease({ news: before, fragments, version: "1.1.0", date: "2026-11-06" });
    const later = [...newsEntries(plan.news, []), { text: "Nach dem Schnitt", heading: null }];
    expect(unseenNow(later.length)).toBe(1);
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
