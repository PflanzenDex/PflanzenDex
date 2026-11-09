// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import news from "@/news/news.de.json";
import { newsEntries, planRelease } from "./news-lines.mjs";
import { capSeen, lineKey, SEEN_CAP } from "./news-keys";
import {
  NEWS_ENTRIES,
  bannerBatch,
  endBanner,
  markAllNewsSeen,
  markKeysSeen,
  unseenEntries,
} from "./whats-new";
import type { NewsEntry } from "./news-lines.mjs";

const SEEN = "pflanzendex.news-seen-lines";
const LEGACY = "pflanzendex.news-seen";
const ALL_KEYS = NEWS_ENTRIES.map((entry) => lineKey(entry.text));

/** The line at a position of the list; a position outside the list is a broken test. */
function at(index: number): NewsEntry {
  const entry = NEWS_ENTRIES[index];
  if (entry === undefined) throw new Error(`no line at ${index}`);
  return entry;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

/** Stores the seen set so that exactly the lines at `unseen` (positions in the list) are unseen. */
function unseenAt(unseen: readonly number[]) {
  window.localStorage.setItem(
    SEEN,
    JSON.stringify(ALL_KEYS.filter((_key, index) => !unseen.includes(index))),
  );
}

const textsOf = (entries: readonly { text: string }[]) => entries.map((entry) => entry.text);

describe("US-DEV-06 the changelog lines", () => {
  it("US-DEV-06 the unreleased lines of news.de.json come last, in the file's order (newest first)", () => {
    const legacy = NEWS_ENTRIES.slice(NEWS_ENTRIES.length - news.unreleased.length);
    expect(legacy.map((entry) => entry.text)).toEqual(news.unreleased);
    expect(NEWS_ENTRIES[0]?.heading).toEqual({ version: null, date: null });
  });

  it("US-DEV-06 every fragment file of news/unreleased is a line of the list", () => {
    const files = Object.keys(import.meta.glob("../../../../news/unreleased/*.json"));
    expect(NEWS_ENTRIES.length - news.unreleased.length).toBe(files.length);
  });
});

describe("US-QS-27 the seen lines are identities, not a count (US-DEV-06)", () => {
  it("US-QS-27 every line has its own key, so a line is seen or not whatever its place in the list", () => {
    expect(new Set(ALL_KEYS).size).toBe(new Set(textsOf(NEWS_ENTRIES)).size);
    expect(lineKey("Eine Zeile.")).toBe(lineKey("Eine Zeile."));
    expect(lineKey("Eine Zeile.")).not.toBe(lineKey("Eine Zeile!"));
  });

  it("US-QS-27 a first visit shows nothing and records every line as seen", () => {
    expect(unseenEntries()).toEqual([]);
    expect(JSON.parse(window.localStorage.getItem(SEEN) ?? "null")).toEqual(ALL_KEYS);
  });

  it("US-QS-27 the unseen lines are the ones whose key is not stored, in display order", () => {
    unseenAt([1, 4]);
    expect(textsOf(unseenEntries())).toEqual(textsOf([at(1), at(4)]));
  });

  it("US-QS-27 a line merged later with a lower issue number is the unseen one, not the first lines (no prefix)", () => {
    // A fragment with a lower issue number sorts below the seen lines: the unseen line is in the middle of the list.
    unseenAt([10]);
    const unseen = unseenEntries();
    expect(textsOf(unseen)).toEqual([at(10).text]);
    expect(unseen[0]).not.toBe(NEWS_ENTRIES[0]);
  });

  it("US-DEV-06 markAllNewsSeen makes every line seen, for example when the page Neu was opened", () => {
    unseenAt([0, 1, 2]);
    expect(markAllNewsSeen()).toBe(true);
    expect(unseenEntries()).toEqual([]);
  });

  it("US-QS-27 markKeysSeen adds keys and keeps the stored ones", () => {
    unseenAt([0, 1, 2]);
    expect(markKeysSeen([lineKey(at(1).text)])).toBe(true);
    expect(textsOf(unseenEntries())).toEqual(textsOf([at(0), at(2)]));
  });

  it("US-QS-27 a corrupt stored set counts as a first visit", () => {
    window.localStorage.setItem(SEEN, "viele");
    expect(unseenEntries()).toEqual([]);
    expect(JSON.parse(window.localStorage.getItem(SEEN) ?? "null")).toEqual(ALL_KEYS);
  });

  it("US-QS-27 the stored set is capped: the keys of lines that are gone go first, then the oldest", () => {
    const current = new Set(["c1", "c2", "c3"]);
    const stored = ["s1", "s2", "s3", "s4", "c1", "c2", "c3"];
    expect(capSeen(stored, current, 4)).toEqual(["s4", "c1", "c2", "c3"]);
    expect(capSeen(stored, current, 10)).toEqual(stored);
    expect(SEEN_CAP).toBe(1000);
  });

  it("US-DEV-06 the count of the rule before is migrated once: its first unseen lines stay unseen, the rest count as seen", () => {
    window.localStorage.setItem(LEGACY, String(NEWS_ENTRIES.length - 3));
    expect(textsOf(unseenEntries())).toEqual(textsOf(NEWS_ENTRIES.slice(0, 3)));
    expect(window.localStorage.getItem(LEGACY)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(SEEN) ?? "null")).toHaveLength(
      NEWS_ENTRIES.length - 3,
    );
  });

  it("US-DEV-06 a stored count above the list (lines were taken back) makes every line new when migrated", () => {
    window.localStorage.setItem(LEGACY, "9999");
    expect(unseenEntries()).toHaveLength(NEWS_ENTRIES.length);
  });

  it("US-DEV-06 storage that throws shows nothing and does not throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => unseenEntries()).not.toThrow();
    expect(unseenEntries()).toEqual([]);
    expect(markKeysSeen(ALL_KEYS)).toBe(false);
  });
});

describe("US-QS-27 the banner's batch and its session", () => {
  it("US-QS-27 the batch is the unseen lines, and it shows again on the next visit in the same session", () => {
    unseenAt([0, 1, 2]);
    const first = bannerBatch();
    expect(textsOf(first)).toEqual(textsOf(NEWS_ENTRIES.slice(0, 3)));
    // Leaving Heute and coming back in the same session: nothing has ended, so the batch is there again.
    expect(textsOf(bannerBatch())).toEqual(textsOf(first));
    expect(unseenEntries()).toHaveLength(3);
  });

  it("US-QS-27 a batch that was shown in an earlier session counts as seen and does not return", () => {
    unseenAt([0, 1, 2]);
    expect(bannerBatch()).toHaveLength(3);
    window.sessionStorage.clear(); // a later session
    expect(bannerBatch()).toEqual([]);
    expect(unseenEntries()).toEqual([]);
  });

  it("US-QS-27 a line that came after the shown batch shows as a new batch in the next session", () => {
    unseenAt([0, 1, 2]);
    expect(bannerBatch()).toHaveLength(3);
    window.sessionStorage.clear();
    // Line 7 arrives between the sessions: it was seen before, now it is unseen and not part of the old batch.
    unseenAt([0, 1, 2, 7]);
    expect(textsOf(bannerBatch())).toEqual([at(7).text]);
  });

  it("US-QS-27 ending the banner (Neuerungen ansehen or Hinweis ausblenden) ends it on this visit and for every later one", () => {
    unseenAt([0, 1, 2]);
    const batch = bannerBatch();
    expect(endBanner(batch)).toBe(true);
    expect(bannerBatch()).toEqual([]);
    window.sessionStorage.clear();
    expect(bannerBatch()).toEqual([]);
  });

  it("US-QS-27 nothing to show records no session and no batch", () => {
    markAllNewsSeen();
    expect(bannerBatch()).toEqual([]);
    expect(window.sessionStorage.getItem("pflanzendex.news-banner-session")).toBeNull();
  });
});

describe("US-DEV-06 a release keeps the identity of its lines", () => {
  it("US-DEV-06 a release moves the lines into a version and their keys stay the same, so they are not new", () => {
    const before = {
      unreleased: ["Alt A", "Alt B"],
      versions: [{ version: "1.0.0", date: "2026-10-01", lines: ["Vorher"] }],
    };
    const fragments = [{ name: "1490-neu.json", line: "Neu" }];
    const plan = planRelease({ news: before, fragments, version: "1.1.0", date: "2026-11-06" });
    const keysBefore = newsEntries(before, fragments).map((entry) => lineKey(entry.text));
    const keysAfter = newsEntries(plan.news, []).map((entry) => lineKey(entry.text));
    expect(keysAfter).toEqual(keysBefore);
  });
});
