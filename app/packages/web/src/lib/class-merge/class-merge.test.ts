import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTailwindMerge, extendTailwindMerge } from "tailwind-merge";
import { MERGE_CONFIG } from "./merge-config";

const SRC = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sourceFiles(join(dir, e.name))
      : /\.(tsx?|css)$/.test(e.name) && !/\.test\./.test(e.name)
        ? [join(dir, e.name)]
        : [],
  );
}

/** Every word in a string literal of the sources; most are no class, which both merges leave alone. */
function words(): string[] {
  const found = new Set<string>();
  for (const file of sourceFiles(SRC))
    for (const m of readFileSync(file, "utf8").matchAll(/["'`]([^"'`\n]{2,400})["'`]/g))
      for (const w of (m[1] ?? "").split(/\s+/))
        if (/^[!a-z0-9[:-][^\s"'`;{}]*$/i.test(w) && w.length < 80) found.add(w);
  return [...found];
}

const full = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["label"] }] } },
});
const small = createTailwindMerge(() => MERGE_CONFIG);

describe("class merge table (US-QS-14, DS-31)", () => {
  it("US-QS-14 · the reduced table merges every class of the app like the full tailwind-merge config", () => {
    // "from-font" is the value of `decoration-from-font`, no class of its own.
    const classes = words().filter((w) => w !== "from-font" && full(`${w} ${w}`) === w);
    expect(classes.length).toBeGreaterThan(100);
    const missing = classes.filter((w) => small(`${w} ${w}`) !== w);
    // A class listed here has a group in the tailwind-merge default config that merge-config.ts lacks: copy it over.
    expect(missing).toEqual([]);
  });

  it("US-QS-14 · classes of the same group resolve to the last one, others stay", () => {
    expect(small("p-2 px-4 text-sm text-label text-primary leading-5")).toBe(
      full("p-2 px-4 text-sm text-label text-primary leading-5"),
    );
    expect(small("bg-card hover:bg-muted bg-primary")).toBe("hover:bg-muted bg-primary");
    expect(small("text-sm text-label")).toBe("text-label");
  });
});
