import { ok } from "../../kernel";
import type { Result, SourceClient, SourceOutcome } from "../../kernel";
import { dig } from "./types";
import { SOURCE_LICENSE } from "./types";
import type { FillSource, SourceSnapshot } from "./types";

const LANGUAGES = ["de", "en"] as const;

interface Hit {
  readonly sourceId: string | null;
  readonly link: string;
  readonly outcome: SourceOutcome;
}

const snapshot = (speciesId: string, source: FillSource, hit: Hit): SourceSnapshot => ({
  speciesId,
  source,
  sourceId: hit.sourceId,
  retrievedAt: hit.outcome.provenance.retrievedAt,
  link: hit.link,
  license: SOURCE_LICENSE[source],
  raw: hit.outcome.kind === "found" ? hit.outcome.data : null,
});

const data = (o: SourceOutcome): unknown => (o.kind === "found" ? o.data : undefined);

async function gbif(sources: SourceClient, name: string): Promise<Result<Hit>> {
  const r = await sources.get({
    source: "gbif",
    path: "/species/match",
    query: { name, rank: "SPECIES", kingdom: "Plantae" },
  });
  if (!r.ok) return r;
  const key = dig(data(r.value), "usageKey");
  const has = typeof key === "number";
  return ok({
    sourceId: has ? String(key) : null,
    link: has ? `https://www.gbif.org/species/${key}` : "https://www.gbif.org",
    outcome: r.value,
  });
}

/** Summary of the German article, else the English one; a disambiguation page counts as found but is not used later. */
async function wikipedia(sources: SourceClient, name: string): Promise<Result<Hit>> {
  let last: SourceOutcome | null = null;
  for (const language of LANGUAGES) {
    const r = await sources.get({
      source: "wikipedia",
      language,
      path: `/api/rest_v1/page/summary/${encodeURIComponent(name.replaceAll(" ", "_"))}`,
    });
    if (!r.ok) return r;
    last = r.value;
    if (r.value.kind === "found" && dig(r.value.data, "type") !== "disambiguation") break;
  }
  if (last === null) throw new Error("no language configured");
  const link = dig(data(last), "content_urls", "desktop", "page");
  const qid = dig(data(last), "wikibase_item");
  return ok({
    sourceId: typeof qid === "string" ? qid : null,
    link: typeof link === "string" ? link : "https://wikipedia.org",
    outcome: last,
  });
}

async function wikidata(sources: SourceClient, qid: string): Promise<Result<Hit>> {
  const r = await sources.get({
    source: "wikidata",
    path: `/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`,
  });
  return r.ok
    ? ok({ sourceId: qid, link: `https://www.wikidata.org/wiki/${qid}`, outcome: r.value })
    : r;
}

/**
 * Asks GBIF (species match), Wikipedia (summary, de else en) and Wikidata (the item of that article) for one species.
 * One snapshot per source asked, "no hit" included; Wikidata is asked only when the article names an item. Throttling,
 * retry and cache belong to the source client; a failure is returned, never swallowed (P-10).
 */
export async function fetchSnapshots(
  sources: SourceClient,
  speciesId: string,
  latinName: string,
): Promise<Result<readonly SourceSnapshot[]>> {
  const g = await gbif(sources, latinName);
  if (!g.ok) return g;
  const w = await wikipedia(sources, latinName);
  if (!w.ok) return w;
  const out = [snapshot(speciesId, "gbif", g.value), snapshot(speciesId, "wikipedia", w.value)];
  if (w.value.sourceId === null) return ok(out);
  const d = await wikidata(sources, w.value.sourceId);
  if (!d.ok) return d;
  return ok([...out, snapshot(speciesId, "wikidata", d.value)]);
}
