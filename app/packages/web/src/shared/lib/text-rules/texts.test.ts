import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { plurals, texts } from "./texts";

const root = new URL("../../../", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** Message tables of the features; the news table has its own shape (US-DEV-09) and its own test. */
const tables = files(root)
  .filter((f) => f.endsWith(".de.json") && !f.endsWith("news.de.json"))
  .map((f) => [relative(root, f), JSON.parse(readFileSync(f, "utf8")) as unknown] as const);

describe("FR-QG-26 texts() reads a message table", () => {
  const t = texts({ plain: "Standort fehlt", count: "{n} Pflanzen in {zone}" });

  it("FR-QG-26 returns the text of a key", () => {
    expect(t("plain")).toBe("Standort fehlt");
  });

  it("FR-QG-26 fills every placeholder", () => {
    expect(t("count", { n: 3, zone: "Zone 2" })).toBe("3 Pflanzen in Zone 2");
  });

  it("FR-QG-26 throws when a placeholder has no value instead of showing it half-filled", () => {
    expect(() => t("count", { n: 3 })).toThrow('UI text "count" needs a value for {zone}');
  });
});

describe("US-QS-32 plurals() picks the form of a counted text (SG-FMT-03)", () => {
  const p = plurals({
    "tiles.treatments.one": "Behandlung",
    "tiles.treatments.other": "Behandlungen",
    "later.short.one": "{count} Termin später",
    "later.short.other": "{count} Termine später",
  });

  it("US-QS-32 the word alone is the singular for 1 and the plural for every other count, zero included", () => {
    expect(p.word("tiles.treatments", 1)).toBe("Behandlung");
    expect(p.word("tiles.treatments", 0)).toBe("Behandlungen");
    expect(p.word("tiles.treatments", 2)).toBe("Behandlungen");
  });

  it("US-QS-32 a count that is still loading reads as the plural, not as the singular", () => {
    expect(p.word("tiles.treatments", undefined)).toBe("Behandlungen");
  });

  it("US-QS-32 the count with its text fills {count}; the space after it is a no-break space", () => {
    expect(p.counted("later.short", 1)).toBe("1\u00a0Termin später");
    expect(p.counted("later.short", 3)).toBe("3\u00a0Termine später");
    expect(p.counted("later.short", 0)).toBe("0\u00a0Termine später");
  });

  it("US-QS-32 a missing form throws instead of showing a half-filled text (P-10)", () => {
    expect(() => p.word("tiles.hints" as "tiles.treatments", 1)).toThrow(
      'UI text "tiles.hints.one" is missing in its table',
    );
  });
});

describe("FR-QG-26 every feature message table is a flat table of German texts", () => {
  it("FR-QG-26 at least one feature table exists", () => {
    expect(tables.length).toBeGreaterThan(0);
  });

  it.each(tables)(
    "FR-QG-26 %s holds only non-empty strings, named after its feature",
    (file, table) => {
      // The table sits in its feature folder and is named after it; the feature folder may lie below app/ (flows).
      // The flat primitives of shared/ui (rule R3, issue 2509) have no folder: a table is named after its component file.
      const parts = file.split("/");
      if (file.startsWith("shared/ui/")) {
        const component = join(root, file.replace(/\.de\.json$/, ".tsx"));
        expect(existsSync(component), `${file} has no component ${relative(root, component)}`).toBe(
          true,
        );
      } else {
        const feature = parts.at(-2);
        expect(file).toBe(`${parts.slice(0, -1).join("/")}/${feature}.de.json`);
      }
      expect(typeof table).toBe("object");
      for (const [key, text] of Object.entries(table as object)) {
        for (const part of key.split(".")) expect(part, key).toMatch(/^[a-z][a-zA-Z0-9]*$/);
        expect(typeof text === "string" && text.trim().length > 0, key).toBe(true);
      }
    },
  );
});
