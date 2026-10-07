import { describe, expect, it } from "vitest";
import { appError, failed, ok } from "../../../kernel";
import type { Result, SourceClient, SourceOutcome, SourceRequest } from "../../../kernel";
import { buildTaxonomy } from "./build";

// US-POK-03: no network; the sources are a table of canned answers (HTTP and clock are mocked at the port).
const T = "2026-10-06T10:00:00.000Z";
const found = (source: SourceRequest["source"], data: unknown, url = "https://x/" + source) =>
  ({
    kind: "found",
    data,
    cached: false,
    provenance: { source, url, retrievedAt: T },
  }) as SourceOutcome;
const missing = (source: SourceRequest["source"]) =>
  ({
    kind: "not_found",
    cached: false,
    provenance: { source, url: "https://x/" + source, retrievedAt: T },
  }) as SourceOutcome;

type Handler = (r: SourceRequest) => Result<SourceOutcome> | undefined;
function client(...handlers: Handler[]) {
  const seen: SourceRequest[] = [];
  const sources: SourceClient = {
    async get(r) {
      seen.push(r);
      for (const h of handlers) {
        const answer = h(r);
        if (answer) return answer;
      }
      throw new Error("unexpected request " + JSON.stringify(r));
    },
  };
  return { sources, seen };
}

const match = (name: string, rank = "species", extra = {}) => ({
  name,
  matches: [
    {
      matched_name: name,
      is_synonym: false,
      is_approximate_match: false,
      taxon: { ott_id: name.length, unique_name: name, rank },
      ...extra,
    },
  ],
});
const tnrs =
  (...results: unknown[]): Handler =>
  (r) =>
    r.path === "/tnrs/match_names" ? ok(found("opentree", { results })) : undefined;
const lineage: Handler = (r) =>
  r.path === "/taxonomy/taxon_info"
    ? ok(
        found("opentree", {
          lineage: [
            { rank: "genus", name: "Ficus" },
            { rank: "family", name: "Moraceae" },
            { rank: "order", name: "Rosales" },
          ],
        }),
      )
    : undefined;
const wikipedia =
  (languages: Record<string, unknown>): Handler =>
  (r) =>
    r.source === "wikipedia"
      ? ok(
          languages[r.language ?? "de"]
            ? found("wikipedia", languages[r.language ?? "de"])
            : missing("wikipedia"),
        )
      : undefined;
const article = (extract: string, qid = "Q1") => ({
  type: "standard",
  wikibase_item: qid,
  extract,
  content_urls: { desktop: { page: "https://de.wikipedia.org/wiki/Ficus_benjamina" } },
  originalimage: { source: "https://upload.example/ficus.jpg" },
});
const wikidata =
  (rank = "Q7432"): Handler =>
  (r) =>
    r.source === "wikidata"
      ? ok(
          found("wikidata", {
            entities: {
              Q1: { claims: { P105: [{ mainsnak: { datavalue: { value: { id: rank } } } }] } },
            },
          }),
        )
      : undefined;
const gbif =
  (count = 850): Handler =>
  (r) => {
    if (r.path === "/species/match") return ok(found("gbif", { usageKey: 7, rank: "GENUS" }));
    if (r.path === "/species/search") return ok(found("gbif", { count }));
    return undefined;
  };

const happy = (extra: Handler[] = []) =>
  client(
    tnrs(match("Ficus benjamina")),
    lineage,
    wikipedia({ de: article("Die Birkenfeige ist eine Art. Sie wächst als Baum. Dritter Satz.") }),
    wikidata(),
    gbif(),
    ...extra,
  );

describe("US-POK-03 taxonomy build", () => {
  it("US-POK-03 resolves order, family and genus with the source of each value", async () => {
    const { sources } = happy();
    const r = await buildTaxonomy(sources, ["Ficus benjamina"]);
    expect(r.ok && r.value.taxa[0]).toMatchObject({
      latinName: "Ficus benjamina",
      lineage: {
        genus: "Ficus",
        family: "Moraceae",
        order: "Rosales",
        provenance: { source: "opentree" },
      },
      text: {
        language: "de",
        text: "Die Birkenfeige ist eine Art. Sie wächst als Baum.",
        imageUrl: "https://upload.example/ficus.jpg",
        provenance: { source: "wikipedia" },
      },
      genusSpeciesCount: { value: 850, provenance: { source: "gbif" } },
    });
  });

  it("US-POK-03 lists a species without a hit in the error list with the reason", async () => {
    const { sources } = client(tnrs({ name: "Nonexistus plantus", matches: [] }));
    const r = await buildTaxonomy(sources, ["Nonexistus plantus"]);
    expect(r.ok && r.value).toEqual({
      taxa: [],
      failures: [{ latinName: "Nonexistus plantus", reason: "taxonomy.no_match" }],
    });
  });

  it("US-POK-03 lists a hit that is not a species and ignores approximate hits", async () => {
    const { sources } = client(
      tnrs(
        match("Ficus", "genus"),
        match("Fikus bnjamina", "species", { is_approximate_match: true }),
      ),
    );
    const r = await buildTaxonomy(sources, ["Ficus", "Fikus bnjamina"]);
    expect(r.ok && r.value.failures).toEqual([
      { latinName: "Ficus", reason: "taxonomy.not_species" },
      { latinName: "Fikus bnjamina", reason: "taxonomy.no_match" },
    ]);
  });

  it("US-POK-03 keeps a renamed genus under the current name", async () => {
    const renamed = {
      name: "Sansevieria trifasciata",
      matches: [
        {
          matched_name: "Sansevieria trifasciata",
          is_synonym: true,
          is_approximate_match: false,
          taxon: { ott_id: 5, unique_name: "Dracaena trifasciata", rank: "species" },
        },
      ],
    };
    const { sources } = client(
      tnrs(renamed),
      (r) =>
        r.path === "/taxonomy/taxon_info"
          ? ok(found("opentree", { lineage: [{ rank: "genus", name: "Dracaena" }] }))
          : undefined,
      wikipedia({}),
      gbif(),
    );
    const r = await buildTaxonomy(sources, ["Sansevieria trifasciata"]);
    expect(r.ok && r.value.taxa[0]).toMatchObject({
      latinName: "Sansevieria trifasciata",
      lineage: {
        acceptedName: "Dracaena trifasciata",
        genus: "Dracaena",
        family: null,
        order: null,
      },
      text: null,
    });
  });

  it("US-POK-03 falls back to the English article, text and image then both English", async () => {
    const en = client(
      tnrs(match("Ficus benjamina")),
      lineage,
      wikipedia({ en: article("The weeping fig is a species.") }),
      wikidata(),
      gbif(),
    );
    const r = await buildTaxonomy(en.sources, ["Ficus benjamina"]);
    expect(r.ok && r.value.taxa[0]?.text).toMatchObject({
      language: "en",
      text: "The weeping fig is a species.",
    });
  });

  it("US-POK-03 discards an article that Wikidata does not rank as species", async () => {
    const { sources } = client(
      tnrs(match("Ficus benjamina")),
      lineage,
      wikipedia({ de: article("Text."), en: article("Text.") }),
      wikidata("Q34740"),
      gbif(),
    );
    const r = await buildTaxonomy(sources, ["Ficus benjamina"]);
    expect(r.ok && r.value.taxa[0]?.text).toBeNull();
  });

  it("US-POK-03 shows a GBIF count of 0 as unknown and asks once per genus", async () => {
    const { sources, seen } = client(
      tnrs(match("Ficus benjamina"), match("Ficus elastica")),
      lineage,
      wikipedia({}),
      gbif(0),
    );
    const r = await buildTaxonomy(sources, ["Ficus elastica", "Ficus benjamina"]);
    expect(r.ok && r.value.taxa.map((t) => t.genusSpeciesCount)).toEqual([null, null]);
    expect(seen.filter((x) => x.path === "/species/search")).toHaveLength(1);
  });

  it("US-POK-03 stops on a source failure and builds nothing (the previous tree stays)", async () => {
    const down = failed(appError("source.unavailable"));
    const { sources } = client(tnrs(match("Ficus benjamina")), lineage, () => down);
    const r = await buildTaxonomy(sources, ["Ficus benjamina"]);
    expect(!r.ok && r.error.code).toBe("source.unavailable");
  });

  it("US-POK-03 is idempotent: same inputs give the same tree, in name order", async () => {
    const one = await buildTaxonomy(happy().sources, ["Ficus benjamina", " Ficus  benjamina"]);
    const two = await buildTaxonomy(happy().sources, ["Ficus benjamina"]);
    expect(one).toEqual(two);
  });

  it("US-POK-03 rejects an unreadable TNRS answer instead of inventing a tree", async () => {
    const { sources } = client((r) =>
      r.path === "/tnrs/match_names" ? ok(found("opentree", { oops: 1 })) : undefined,
    );
    const r = await buildTaxonomy(sources, ["Ficus benjamina"]);
    expect(!r.ok && r.error.code).toBe("source.response_invalid");
  });
});
