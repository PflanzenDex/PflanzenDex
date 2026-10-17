// Where each external source lives and how a request becomes a URL (TE-09). Only these hosts are ever called.
import type { SourceRequest } from "@pflanzendex/core";

export function sourceUrl(request: SourceRequest): string {
  const language = /^[a-z]{2,3}$/.test(request.language ?? "") ? request.language : "de";
  const roots = {
    wikipedia: `https://${language}.wikipedia.org`,
    wikidata: "https://www.wikidata.org",
    gbif: "https://api.gbif.org/v1",
    opentree: "https://api.opentreeoflife.org/v3",
    commons: "https://commons.wikimedia.org",
  } as const;
  const url = new URL(roots[request.source] + request.path);
  for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

// Request builders: one per source, so that callers never assemble paths themselves.

export const wikipediaSummary = (title: string, language = "de"): SourceRequest => ({
  source: "wikipedia",
  language,
  path: `/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
});

export const wikidataEntity = (id: string): SourceRequest => ({
  source: "wikidata",
  path: `/wiki/Special:EntityData/${encodeURIComponent(id)}.json`,
});

export const gbifMatch = (name: string): SourceRequest => ({
  source: "gbif",
  path: "/species/match",
  query: { name },
});

export const openTreeMatch = (names: readonly string[]): SourceRequest => ({
  source: "opentree",
  path: "/tnrs/match_names",
  body: { names },
});
