import { describe, expect, it } from "vitest";
import { appError, failed, ok } from "../../kernel";
import type { SourceClient, SourceRequest } from "../../kernel";
import { CATALOG_FILL_JOB_TYPE, orderCatalogFill, runCatalogFill } from "./fill";
import { deriveFields } from "./derive";
import type { CatalogFillStore, FieldValue, FillCandidate, SourceSnapshot } from "./types";

const AT = "2026-10-18T08:00:00.000Z";
const prov = (source: "gbif" | "wikipedia" | "wikidata") => ({ source, url: "u", retrievedAt: AT });
const found = (source: "gbif" | "wikipedia" | "wikidata", data: unknown) =>
  ok({ kind: "found" as const, data, provenance: prov(source), cached: false });

/** Stub port: no real request in tests. */
function stub(calls: SourceRequest[] = []): SourceClient {
  return {
    async get(r) {
      calls.push(r);
      if (r.source === "gbif")
        return found("gbif", {
          usageKey: 42,
          matchType: "EXACT",
          rank: "SPECIES",
          family: "Moraceae",
        });
      if (r.source === "wikipedia")
        return found("wikipedia", {
          title: "Birkenfeige",
          extract: "Die Birkenfeige ist eine Pflanze. Sie wächst als Baum. Dritter Satz.",
          wikibase_item: "Q1",
          content_urls: { desktop: { page: "https://de.wikipedia.org/wiki/Birkenfeige" } },
        });
      return found("wikidata", { entities: { Q1: { labels: { de: { value: "Birkenfeige" } } } } });
    },
  };
}

function memory(candidates: FillCandidate[]) {
  const state = {
    snaps: [] as SourceSnapshot[],
    values: [] as FieldValue[],
    done: new Set<string>(),
  };
  const store: CatalogFillStore = {
    async candidates() {
      return candidates.filter((c) => !state.done.has(c.id));
    },
    async record(id, snaps, values) {
      state.snaps.push(...snaps);
      state.values.push(...values);
      state.done.add(id);
    },
  };
  return { state, store };
}
const ficus: FillCandidate = {
  id: "s1",
  latinName: "Ficus benjamina",
  empty: ["familyLatin", "germanName", "botanicalStory"],
};

describe("US-BES-12 fill the catalog from open sources", () => {
  it("US-BES-12 stores a snapshot per source and fills empty fields with source, link, license and date", async () => {
    const { state, store } = memory([ficus]);
    const r = await runCatalogFill({ store, sources: stub() });
    expect(r.filled).toBe(3);
    expect(state.snaps.map((s) => [s.source, s.license])).toEqual([
      ["gbif", "CC0-1.0"],
      ["wikipedia", "CC-BY-SA-4.0"],
      ["wikidata", "CC0-1.0"],
    ]);
    const family = state.values.find((v) => v.field === "familyLatin");
    expect(family).toMatchObject({
      value: "Moraceae",
      origin: "source",
      source: "gbif",
      link: "https://www.gbif.org/species/42",
      retrievedAt: AT,
      disputed: false,
    });
    expect(state.values.find((v) => v.field === "botanicalStory")?.value).toBe(
      "Die Birkenfeige ist eine Pflanze. Sie wächst als Baum.",
    );
  });

  it("US-BES-12 takes the first-ranked source and marks differing values disputed, never a mean", () => {
    const snaps: SourceSnapshot[] = [
      {
        speciesId: "s1",
        source: "wikidata",
        sourceId: "Q1",
        retrievedAt: AT,
        link: "w",
        license: "CC0-1.0",
        raw: { entities: { Q1: { labels: { de: { value: "Weinfeige" } } } } },
      },
      {
        speciesId: "s1",
        source: "wikipedia",
        sourceId: null,
        retrievedAt: AT,
        link: "p",
        license: "CC-BY-SA-4.0",
        raw: {
          title: "Birkenfeige",
          content_urls: { desktop: { page: "https://de.wikipedia.org/x" } },
        },
      },
    ];
    const [v] = deriveFields(snaps, "Ficus benjamina", ["germanName"]);
    expect(v).toMatchObject({ value: "Weinfeige", source: "wikidata", disputed: true });
  });

  it("US-BES-12 leaves a field unknown when no source gives it and never fills a non-empty field (P-08)", async () => {
    const none: SourceClient = {
      get: async (r) =>
        ok({ kind: "not_found" as const, provenance: prov(r.source as "gbif"), cached: false }),
    };
    const { state, store } = memory([ficus]);
    expect((await runCatalogFill({ store, sources: none })).filled).toBe(0);
    expect(state.values).toEqual([]);
    expect(state.snaps.every((s) => s.raw === null)).toBe(true);
    const only = deriveFields(
      [
        {
          speciesId: "s1",
          source: "gbif",
          sourceId: "1",
          retrievedAt: AT,
          link: "g",
          license: "CC0-1.0",
          raw: { matchType: "FUZZY", rank: "SPECIES", family: "X" },
        },
      ],
      "Ficus benjamina",
      ["familyLatin"],
    );
    expect(only).toEqual([]);
    expect(deriveFields([], "x", [])).toEqual([]);
  });

  it("US-BES-12 asks only through the source client and keeps going after a failing species, then throws for the retry", async () => {
    const calls: SourceRequest[] = [];
    const ok1 = stub(calls);
    const flaky: SourceClient = {
      get: (r) =>
        r.query?.["name"] === "Bad plant"
          ? Promise.resolve(failed(appError("source.unavailable")))
          : ok1.get(r),
    };
    const { state, store } = memory([{ ...ficus, id: "bad", latinName: "Bad plant" }, ficus]);
    await expect(runCatalogFill({ store, sources: flaky })).rejects.toThrow(
      "Bad plant: source.unavailable",
    );
    expect(state.done.has("s1")).toBe(true);
    expect(state.done.has("bad")).toBe(false);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("US-BES-12 first start is idempotent: queues one job only while gaps exist, a rerun does nothing", async () => {
    const { store } = memory([ficus]);
    const ordered: [string, string][] = [];
    const order = async (t: string, k: string) => void ordered.push([t, k]);
    expect(await orderCatalogFill({ store, order })).toBe("queued");
    expect(ordered).toEqual([[CATALOG_FILL_JOB_TYPE, "fill"]]);
    await runCatalogFill({ store, sources: stub() });
    expect(await orderCatalogFill({ store, order })).toBe("up_to_date");
    expect((await runCatalogFill({ store, sources: stub() })).filled).toBe(0);
    expect(ordered).toHaveLength(1);
  });
});
