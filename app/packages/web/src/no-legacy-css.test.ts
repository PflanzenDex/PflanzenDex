import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL(".", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}
const all = files(root).map((f) => relative(root, f));

describe("US-QS-07 · DS-27 legacy CSS is retired", () => {
  it("US-QS-07 · DS-27 no stylesheet under src except styles/", () => {
    expect(all.filter((f) => f.endsWith(".css") && !f.startsWith("styles/"))).toEqual([]);
  });

  it("US-QS-07 · DS-33 the Tailwind base layer (preflight) is enabled", () => {
    const tokens = readFileSync(join(root, "styles/tokens.css"), "utf8");
    expect(tokens).toMatch(/@import "tailwindcss\/preflight"/);
  });

  it("US-QS-07 · DS-33 no source file imports style.css or sets an important override against legacy rules", () => {
    const sources = all.filter(
      (f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"),
    );
    const hits = sources.filter((f) => {
      const text = readFileSync(join(root, f), "utf8");
      return /style\.css/.test(text) || /\b(?:size-5|min-h-0|p-0)!/.test(text);
    });
    expect(hits).toEqual([]);
  });
});
