import { ok } from "../../../kernel";
import type { Result, SourceClient } from "../../../kernel";
import { asText, dig } from "../types";
import type { TaxonText } from "../types";
import { shortText } from "./summary";

const LANGUAGES = ["de", "en"] as const;
const WIKIDATA_RANK = "P105";
const WIKIDATA_SPECIES = "Q7432";

/** Wikidata check: the article is about a taxon of rank species, not about a genus or a disambiguation. */
async function isSpecies(sources: SourceClient, qid: string): Promise<Result<boolean>> {
  const r = await sources.get({
    source: "wikidata",
    path: `/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`,
  });
  if (!r.ok) return r;
  if (r.value.kind === "not_found") return ok(false);
  const ranks = dig(r.value.data, "entities", qid, "claims", WIKIDATA_RANK);
  return ok(
    Array.isArray(ranks) &&
      ranks.some((c) => dig(c, "mainsnak", "datavalue", "value", "id") === WIKIDATA_SPECIES),
  );
}

interface Article {
  readonly qid: string;
  readonly pageUrl: string;
  readonly extract: string | null;
  readonly imageUrl: string | null;
}

/** The usable parts of a summary; `null` for a disambiguation page or a page without Wikidata item or URL. */
function readArticle(page: unknown): Article | null {
  const qid = asText(dig(page, "wikibase_item"));
  const pageUrl = asText(dig(page, "content_urls", "desktop", "page"));
  if (dig(page, "type") === "disambiguation" || qid === null || pageUrl === null) return null;
  return {
    qid,
    pageUrl,
    extract: asText(dig(page, "extract")),
    imageUrl: asText(dig(page, "originalimage", "source") ?? dig(page, "thumbnail", "source")),
  };
}

/**
 * Wikipedia summary (de, else en) of the accepted name, accepted only when Wikidata confirms rank species. Text and
 * image come from the same article. No usable article: `null` (unknown), cached as a result by the source client.
 */
export async function enrichText(
  sources: SourceClient,
  acceptedName: string,
): Promise<Result<TaxonText | null>> {
  for (const language of LANGUAGES) {
    const r = await sources.get({
      source: "wikipedia",
      language,
      path: `/api/rest_v1/page/summary/${encodeURIComponent(acceptedName.replaceAll(" ", "_"))}`,
    });
    if (!r.ok) return r;
    const article = r.value.kind === "found" ? readArticle(r.value.data) : null;
    if (article === null) continue;
    const species = await isSpecies(sources, article.qid);
    if (!species.ok) return species;
    if (!species.value) continue;
    return ok({
      language,
      text: article.extract === null ? null : shortText(article.extract),
      imageUrl: article.imageUrl,
      pageUrl: article.pageUrl,
      provenance: r.value.provenance,
    });
  }
  return ok(null);
}
