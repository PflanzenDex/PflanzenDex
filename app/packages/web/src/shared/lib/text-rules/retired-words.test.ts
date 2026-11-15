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

/** SG-COPY-01: a title is one sentence without a full stop; a full stop at its end or before a next sentence fails. */
const SENTENCE_END = /\.\s*$|\.\s+[\p{Lu}\p{Nd}{]/u;

/** Abbreviations whose full stop is no sentence end ("z. B.", "u. a.", "Nr. 3", "bzw.", "ca."). Listed, not guessed: a rule for
 * any short word would hide real endings such as "Heute steht nichts an." */
const ABBREVIATION =
  /\b(?:z\. ?B|u\. ?a|d\. ?h|z\. ?T|bzw|ca|usw|etc|vgl|inkl|evtl|ggf|Nr|Std|Min|Abs|Dr|Mio|Mrd|Tel)\./g;

/** The text ends a sentence inside a title (SG-COPY-01): an abbreviation's full stop does not count. */
const isSentenceEnd = (text: string) => SENTENCE_END.test(text.replace(ABBREVIATION, "abk"));

/** A property value that is only a type name ("string", "string | undefined"): no literal can be in it. */
const TYPE_ONLY = /^[\w.<>[\]|\s]+$/;

/** The index just past the quoted string or template that starts at `i`. */
function stringEnd(src: string, i: number): number {
  const quote = src.charAt(i);
  let j = i + 1;
  while (j < src.length && src.charAt(j) !== quote) j += src.charAt(j) === "\\" ? 2 : 1;
  return j + 1;
}

/** The index where the comment that starts at `j` ends, or `null` when no comment starts there. */
function commentEnd(src: string, j: number): number | null {
  if (src.charAt(j) !== "/") return null;
  if (src.charAt(j + 1) === "/") {
    const nl = src.indexOf("\n", j);
    return nl < 0 ? src.length : nl;
  }
  if (src.charAt(j + 1) !== "*") return null;
  const close = src.indexOf("*/", j);
  return close < 0 ? src.length : close + 1;
}

/** The index of the `,` or the closing bracket that ends the value starting at `i`; strings and comments are skipped. */
function valueEnd(src: string, i: number): number {
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src.charAt(j);
    const cEnd = commentEnd(src, j);
    if (cEnd !== null) j = cEnd;
    else if (c === '"' || c === "'" || c === "`") j = stringEnd(src, j) - 1;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) {
      if (depth === 0) return j;
      depth--;
    } else if ((c === "," || c === ";") && depth === 0) return j;
  }
  return src.length;
}

/** The text of a template with its `${…}` parts marked as `{}`, so a sentence end before a value is seen. */
const templateText = (body: string) => body.replace(/\$\{[^}]*\}/g, "{}");

/** The string literals an expression can show: quotes, templates and named constants; comments are skipped. */
function literalsIn(expr: string, constants: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  for (let i = 0; i < expr.length; i++) {
    const c = expr.charAt(i);
    const cEnd = commentEnd(expr, i);
    if (cEnd !== null) i = cEnd;
    else if (c === '"' || c === "'" || c === "`") {
      const end = stringEnd(expr, i);
      const body = expr.slice(i + 1, end - 1);
      out.push(c === "`" ? templateText(body) : body);
      i = end - 1;
    } else if (/[A-Za-z_]/.test(c)) {
      const word = /^\w+/.exec(expr.slice(i))?.[0] ?? c;
      const value = constants.get(word);
      if (value !== undefined) out.push(value);
      i += word.length - 1;
    }
  }
  return out;
}

/** The title values of a source with a sentence end: `title=` attributes and `title:` properties, constants included. */
function titleHits(src: string): { line: number; text: string }[] {
  const constants = new Map<string, string>();
  for (const m of src.matchAll(/\bconst\s+(\w+)\s*=\s*"([^"\n]*)"/g))
    constants.set(m[1] ?? "", m[2] ?? "");
  const hits: { line: number; text: string }[] = [];
  for (const m of src.matchAll(/(?:^|[\s{,(])title\??\s*(?:=(?!=)|:)\s*/gm)) {
    const at = (m.index ?? 0) + m[0].length;
    const sep = m[0].trimEnd().slice(-1);
    let expr: string;
    if (sep === "=" && src.charAt(at) === '"') expr = src.slice(at, stringEnd(src, at));
    else if (sep === "=" && src.charAt(at) === "{") expr = src.slice(at + 1, valueEnd(src, at + 1));
    else if (sep === ":") {
      expr = src.slice(at, valueEnd(src, at));
      if (TYPE_ONLY.test(expr.trim()) && !constants.has(expr.trim())) continue;
    } else continue;
    for (const text of literalsIn(expr, constants))
      if (isSentenceEnd(text.trim()))
        hits.push({ line: src.slice(0, at).split("\n").length, text });
  }
  return hits;
}

describe("US-QS-32 copy rules (SG-COPY-01, SG-COPY-04)", () => {
  it("US-QS-32 SG-COPY-01 the title scan sees a full stop in a multi-line title, a key and a constant", () => {
    const sample = [
      'const T = "Ende.";',
      "const a = <EmptyState",
      "  title={",
      "    // note",
      '    ok ? "Gut" : "Schlecht."',
      "  }",
      "/>;",
      "const o = { title: `Eins. {} zwei` };",
      "const p = <X title={T} />;",
    ].join("\n");
    expect(titleHits(sample).map((h) => h.text)).toEqual(["Schlecht.", "Eins. {} zwei", "Ende."]);
  });

  it("US-QS-32 SG-COPY-01 the title scan reads a constant on the next line, skips type annotations and keeps abbreviations apart", () => {
    const wrapped = 'const N =\n  "Ende.";\nconst q = <X title={N} />;';
    expect(titleHits(wrapped).map((h) => h.text)).toEqual(["Ende."]);
    const types = "interface P { title: string; title?: string | undefined; }";
    expect(titleHits(types)).toEqual([]);
    const abbreviations =
      'const a = <X title="Teil z. B. 3 und Nr. 4" />;\nconst b = <X title="Heute steht nichts an." />;';
    expect(titleHits(abbreviations).map((h) => h.text)).toEqual(["Heute steht nichts an."]);
  });

  it("US-QS-32 SG-COPY-01 a title has no full stop and holds one sentence, in a message table or a title prop", () => {
    const hits: string[] = [];
    for (const file of sources.filter((f) => f.endsWith(".de.json"))) {
      const table = JSON.parse(readFileSync(join(root, file), "utf8")) as Record<string, string>;
      for (const [key, text] of Object.entries(table))
        if (/title$/i.test(key) && isSentenceEnd(text)) hits.push(`${file} ${key}`);
    }
    for (const file of sources.filter((f) => f.endsWith(".tsx") || f.endsWith(".ts")))
      for (const hit of titleHits(readFileSync(join(root, file), "utf8")))
        hits.push(`${file}:${hit.line} ${JSON.stringify(hit.text)}`);
    expect(hits).toEqual([]);
  });

  it("US-QS-32 SG-COPY-04 an omission has a space before the ellipsis, in a text or a message table", () => {
    const hits: string[] = [];
    // The dated release notes are history and keep their texts (EXCEPTIONS in term-table.ts).
    for (const file of sources.filter((f) => !/(^|\/)news\/news\.de\.json$/.test(f)))
      for (const { text, n } of lines(file)) if (/\p{L}…/u.test(text)) hits.push(`${file}:${n}`);
    expect(hits).toEqual([]);
    expect(/\p{L}…/u.test("Laden…")).toBe(true);
    expect(/\p{L}…/u.test("Lädt …")).toBe(false);
  });
});
