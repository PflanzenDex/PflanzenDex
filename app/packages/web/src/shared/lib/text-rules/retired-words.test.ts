import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { EXCEPTIONS, RETIRED_WORDS, THREE_DOTS } from "./term-table";

const root = new URL("../../../", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** UI text sources: components and message tables, not tests, stories or fixtures. */
const sources = files(root)
  .map((f) => relative(root, f))
  .filter((f) => /\.(tsx?|json)$/.test(f))
  .filter((f) => !/\.(test|stories)\.tsx?$/.test(f) && !f.endsWith(".fixtures.tsx"))
  .filter((f) => !f.endsWith(".json") || f.endsWith(".de.json"));

/** The lines that are text, not comments. */
const lines = (file: string) =>
  readFileSync(join(root, file), "utf8")
    .split("\n")
    .map((text, i) => ({ text, n: i + 1 }))
    .filter(({ text }) => !/^\s*(\/\/|\/?\*)/.test(text));

describe("US-QS-24 one word per concept", () => {
  it("US-QS-24 no retired word appears in a UI text", () => {
    expect(sources.length).toBeGreaterThan(100);
    const hits: string[] = [];
    for (const file of sources) {
      if (EXCEPTIONS.some((e) => e.file.test(file))) continue;
      for (const { text, n } of lines(file))
        for (const w of RETIRED_WORDS)
          if (w.pattern.test(text))
            hits.push(`${file}:${n} says "${w.concept}" differently, use "${w.use}"`);
    }
    expect(hits).toEqual([]);
  });

  it("US-QS-24 every exception names a reason", () => {
    for (const e of EXCEPTIONS) expect(e.reason.length).toBeGreaterThan(10);
  });

  it("US-QS-24 the term table catches a retired word", () => {
    expect(RETIRED_WORDS.some((w) => w.pattern.test("Zurück zum Bestand"))).toBe(true);
    expect(RETIRED_WORDS.some((w) => w.pattern.test("Lege ein Exemplar an"))).toBe(true);
    expect(RETIRED_WORDS.some((w) => w.pattern.test("Lampe 3 hat Platz"))).toBe(true);
    expect(RETIRED_WORDS.some((w) => w.pattern.test("Die Lampe leuchtet nicht"))).toBe(false);
    expect(RETIRED_WORDS.some((w) => w.pattern.test("Zurück zur Sammlung"))).toBe(false);
  });

  it("US-QS-24 a text with an omission uses the ellipsis character, not three dots", () => {
    const hits: string[] = [];
    for (const file of sources)
      for (const { text, n } of lines(file)) if (THREE_DOTS.test(text)) hits.push(`${file}:${n}`);
    expect(hits).toEqual([]);
    expect(THREE_DOTS.test("Lädt...")).toBe(true);
    expect(THREE_DOTS.test("Lädt …")).toBe(false);
  });
});

/**
 * Files another open PR is changing (US-QS-32, the same rule as EXCEPTIONS in term-table.ts): their title literal waits for
 * that PR. Remove the row when it lands; a row is never added to turn the test green.
 */
const IN_FLIGHT = [/(^|\/)request-state\/request-state\.tsx$/];

describe("US-QS-32 copy rules (SG-COPY-01)", () => {
  it("US-QS-32 SG-COPY-01 a title has no full stop, in a message table or in a title prop", () => {
    const hits: string[] = [];
    for (const file of sources.filter((f) => f.endsWith(".de.json"))) {
      const table = JSON.parse(readFileSync(join(root, file), "utf8")) as Record<string, string>;
      for (const [key, text] of Object.entries(table))
        if (/title$/i.test(key) && text.endsWith(".")) hits.push(`${file} ${key}`);
    }
    for (const file of sources.filter(
      (f) => f.endsWith(".tsx") && !IN_FLIGHT.some((e) => e.test(f)),
    ))
      for (const { text, n } of lines(file))
        if (/\btitle=/.test(text) && /["`][^"`\n]*\.["`]/.test(text)) hits.push(`${file}:${n}`);
    expect(hits).toEqual([]);
  });
});
