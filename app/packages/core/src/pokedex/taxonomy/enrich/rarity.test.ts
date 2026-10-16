import { describe, expect, it } from "vitest";
import { appError, failed, ok } from "../../../kernel";
import type { Result, SourceClient, SourceOutcome, SourceRequest } from "../../../kernel";
import { natureRarity } from "./rarity";

// US-POK-13: no network; GBIF answers are canned at the source port.
const T = "2026-10-16T10:00:00.000Z";
const found = (data: unknown, url: string): SourceOutcome => ({
  kind: "found",
  data,
  cached: false,
  provenance: { source: "gbif", url, retrievedAt: T },
});
const missing = (url: string): SourceOutcome => ({
  kind: "not_found",
  cached: false,
  provenance: { source: "gbif", url, retrievedAt: T },
});

function gbif(answers: Record<string, Result<SourceOutcome>>) {
  const seen: string[] = [];
  const sources: SourceClient = {
    async get(r: SourceRequest) {
      seen.push(r.path);
      const answer = answers[r.path];
      if (!answer) throw new Error("unexpected request " + r.path);
      return answer;
    },
  };
  return { sources, seen };
}
const exact = { usageKey: 42, rank: "SPECIES", status: "ACCEPTED", matchType: "EXACT" };
const MATCH = "/species/match";
const IUCN = "/species/42/iucnRedListCategory";
const COUNT = "/occurrence/count";

describe("US-POK-13 rarity in nature", () => {
  it("US-POK-13 takes the IUCN category and the GBIF occurrence count with source and retrieval date", async () => {
    const { sources } = gbif({
      [MATCH]: ok(found(exact, "https://gbif/match")),
      [IUCN]: ok(found({ code: "EN", category: "ENDANGERED" }, "https://gbif/iucn")),
      [COUNT]: ok(found(1231, "https://gbif/count")),
    });
    const r = await natureRarity(sources, "Ficus benjamina");
    expect(r).toEqual(
      ok({
        iucn: {
          category: "EN",
          provenance: { source: "gbif", url: "https://gbif/iucn", retrievedAt: T },
        },
        occurrences: {
          count: 1231,
          provenance: { source: "gbif", url: "https://gbif/count", retrievedAt: T },
        },
      }),
    );
  });

  it("US-POK-13 shows unknown for a species without assessment, and a count of 0 as unknown", async () => {
    const { sources } = gbif({
      [MATCH]: ok(found(exact, "u")),
      [IUCN]: ok(missing("u")),
      [COUNT]: ok(found(0, "u")),
    });
    expect(await natureRarity(sources, "Ficus benjamina")).toEqual(
      ok({ iucn: null, occurrences: null }),
    );
  });

  it("US-POK-13 treats a category outside the known list as unknown instead of guessing", async () => {
    const { sources } = gbif({
      [MATCH]: ok(found(exact, "u")),
      [IUCN]: ok(found({ code: "NE" }, "u")),
      [COUNT]: ok(found(5, "u")),
    });
    const r = await natureRarity(sources, "Ficus benjamina");
    expect(r.ok && r.value.iucn).toBeNull();
  });

  it("US-POK-13 takes no value for an approximate match or another rank, and asks nothing more", async () => {
    for (const data of [
      { ...exact, matchType: "FUZZY" },
      { ...exact, rank: "GENUS" },
      { matchType: "NONE" },
    ]) {
      const { sources, seen } = gbif({ [MATCH]: ok(found(data, "u")) });
      expect(await natureRarity(sources, "Ficus benjamina")).toEqual(
        ok({ iucn: null, occurrences: null }),
      );
      expect(seen).toEqual([MATCH]);
    }
  });

  it("US-POK-13 returns a source failure as an error, never as unknown (P-10)", async () => {
    const error = failed(appError("source.unavailable"));
    const { sources } = gbif({
      [MATCH]: ok(found(exact, "u")),
      [IUCN]: error,
    });
    expect(await natureRarity(sources, "Ficus benjamina")).toBe(error);
  });
});
