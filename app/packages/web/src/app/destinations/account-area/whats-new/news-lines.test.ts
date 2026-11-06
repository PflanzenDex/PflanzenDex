import { describe, expect, it } from "vitest";
import {
  fragmentLine,
  germanDate,
  isFragmentName,
  newsEntries,
  orderFragments,
  planRelease,
  type NewsFile,
  type NewsVersion,
} from "./news-lines.mjs";

const news = (unreleased: string[] = [], versions: NewsVersion[] = []): NewsFile => ({
  unreleased,
  versions,
});
const frag = (name: string, line: string | null = `Zeile ${name}`) => ({ name, line });

describe("US-DEV-06 fragment names and lines", () => {
  it("US-DEV-06 a fragment name is the issue number, a dash, a slug and .json", () => {
    expect(isFragmentName("1486-news-entries.json")).toBe(true);
    expect(isFragmentName("news.de.json")).toBe(false);
    expect(isFragmentName("1486-News.json")).toBe(false);
    expect(isFragmentName("1486.json")).toBe(false);
  });

  it("US-DEV-06 the line of a fragment is its non-empty text, trimmed", () => {
    expect(fragmentLine('{ "line": "  Eine Zeile. " }')).toBe("Eine Zeile.");
    expect(fragmentLine('{ "line": "" }')).toBeNull();
    expect(fragmentLine('{ "line": 3 }')).toBeNull();
    expect(fragmentLine('{ "text": "falscher Schlüssel" }')).toBeNull();
    expect(fragmentLine("kein JSON")).toBeNull();
    expect(fragmentLine("null")).toBeNull();
  });

  it("US-DEV-06 the dates of the versions are shown as German dates", () => {
    expect(germanDate("2026-11-06")).toBe("06.11.2026");
    expect(germanDate("unbekannt")).toBe("unbekannt");
  });
});

describe("US-DEV-06 the display order of the fragments", () => {
  it("US-DEV-06 the newest issue comes first, a tie is ordered by file name", () => {
    const order = orderFragments([
      frag("1400-a.json"),
      frag("1486-b.json"),
      frag("1486-a.json"),
      frag("1401-c.json"),
    ]).map((f) => f.name);
    expect(order).toEqual(["1486-a.json", "1486-b.json", "1401-c.json", "1400-a.json"]);
  });

  it("US-DEV-06 the order does not depend on the order the files are read in", () => {
    const a = [frag("1401-x.json"), frag("1402-y.json")];
    expect(orderFragments(a)).toEqual(orderFragments([...a].reverse()));
  });
});

describe("US-DEV-06 the lines in display order", () => {
  it("US-DEV-06 fragments first, then the unreleased lines, then the versions, each with its heading", () => {
    const entries = newsEntries(
      news(
        ["Alt A", "Alt B"],
        [
          { version: "1.2.0", date: "2026-11-06", lines: ["V1 a", "V1 b"] },
          { version: "1.1.0", date: "2026-10-01", lines: ["V0 a"] },
        ],
      ),
      [frag("1490-neu.json", "Neu"), frag("1480-aelter.json", "Älter")],
    );
    expect(entries.map((e) => e.text)).toEqual([
      "Neu",
      "Älter",
      "Alt A",
      "Alt B",
      "V1 a",
      "V1 b",
      "V0 a",
    ]);
    expect(entries.map((e) => e.heading)).toEqual([
      { version: null, date: null },
      null,
      null,
      null,
      { version: "1.2.0", date: "2026-11-06" },
      null,
      { version: "1.1.0", date: "2026-10-01" },
    ]);
  });

  it("US-DEV-06 a fragment without a usable line is left out of the list, not shown empty", () => {
    const entries = newsEntries(news(["Alt"]), [
      frag("1490-leer.json", ""),
      frag("1491-ok.json", "Ok"),
    ]);
    expect(entries.map((e) => e.text)).toEqual(["Ok", "Alt"]);
  });
});

describe("US-DEV-06 a release moves the lines and shows each line once", () => {
  const before = news(
    ["Alt A", "Alt B"],
    [{ version: "1.0.0", date: "2026-10-01", lines: ["V0"] }],
  );
  const fragments = [frag("1490-neu.json", "Neu"), frag("1480-aelter.json", "Älter")];

  it("US-DEV-06 the release lists the same texts in the same order before and after", () => {
    const { news: after } = planRelease({
      news: before,
      fragments,
      version: "1.1.0",
      date: "2026-11-06",
    });
    const shownBefore = newsEntries(before, fragments).map((e) => e.text);
    const shownAfter = newsEntries(after, []).map((e) => e.text);
    expect(shownAfter).toEqual(shownBefore);
  });

  it("US-DEV-06 the new version takes the fragments and the unreleased lines and goes first", () => {
    const plan = planRelease({ news: before, fragments, version: "1.1.0", date: "2026-11-06" });
    expect(plan.news.unreleased).toEqual([]);
    expect(plan.news.versions.map((v) => v.version)).toEqual(["1.1.0", "1.0.0"]);
    expect(plan.news.versions[0]).toEqual({
      version: "1.1.0",
      date: "2026-11-06",
      lines: ["Neu", "Älter", "Alt A", "Alt B"],
    });
    expect(plan.remove).toEqual(["1490-neu.json", "1480-aelter.json"]);
  });

  it("US-DEV-06 a line that moved into a version has the same count, so it is not new", () => {
    const total = newsEntries(before, fragments).length;
    const plan = planRelease({ news: before, fragments, version: "1.1.0", date: "2026-11-06" });
    expect(newsEntries(plan.news, []).length).toBe(total);
  });

  it("US-DEV-06 a version that exists already is refused", () => {
    expect(() =>
      planRelease({ news: before, fragments, version: "1.0.0", date: "2026-11-06" }),
    ).toThrow(/exists already/);
  });

  it("US-DEV-06 a version that is not x.y.z is refused", () => {
    for (const version of ["v1.1.0", "1.1", "1.1.0-rc1", ""])
      expect(() => planRelease({ news: before, fragments, version, date: "2026-11-06" })).toThrow(
        /x\.y\.z/,
      );
  });

  it("US-DEV-06 a date that is not YYYY-MM-DD is refused", () => {
    expect(() =>
      planRelease({ news: before, fragments, version: "1.1.0", date: "06.11.2026" }),
    ).toThrow(/YYYY-MM-DD/);
  });

  it("US-DEV-06 a fragment without a line blocks the release, so no line vanishes", () => {
    expect(() =>
      planRelease({
        news: before,
        fragments: [...fragments, frag("1499-kaputt.json", null)],
        version: "1.1.0",
        date: "2026-11-06",
      }),
    ).toThrow(/1499-kaputt\.json/);
  });

  it("US-DEV-06 a release without any unreleased line is refused", () => {
    expect(() =>
      planRelease({ news: news([], []), fragments: [], version: "1.1.0", date: "2026-11-06" }),
    ).toThrow(/no unreleased line/);
  });
});
