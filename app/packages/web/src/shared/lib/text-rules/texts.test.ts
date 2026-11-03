import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { texts } from "./texts";

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

describe("FR-QG-26 every feature message table is a flat table of German texts", () => {
  it("FR-QG-26 at least one feature table exists", () => {
    expect(tables.length).toBeGreaterThan(0);
  });

  it.each(tables)(
    "FR-QG-26 %s holds only non-empty strings, named after its feature",
    (file, table) => {
      const [feature] = file.split("/");
      expect(file).toBe(`${feature}/${feature}.de.json`);
      expect(typeof table).toBe("object");
      for (const [key, text] of Object.entries(table as object)) {
        for (const part of key.split(".")) expect(part, key).toMatch(/^[a-z][a-zA-Z0-9]*$/);
        expect(typeof text === "string" && text.trim().length > 0, key).toBe(true);
      }
    },
  );
});
