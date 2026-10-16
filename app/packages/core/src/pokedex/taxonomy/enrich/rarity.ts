import { ok } from "../../../kernel";
import type { Result, SourceClient, SourceOutcome } from "../../../kernel";
import { dig, IUCN_CATEGORIES } from "../types";
import type { IucnCategory, NatureRarity } from "../types";

const isCategory = (v: unknown): v is IucnCategory =>
  IUCN_CATEGORIES.some((category) => category === v);

/** Key of an exact species match; an approximate match or another rank gives none. */
function exactSpeciesKey(match: unknown): number | null {
  const key = dig(match, "usageKey");
  const exact = dig(match, "matchType") === "EXACT" && dig(match, "rank") === "SPECIES";
  return exact && typeof key === "number" ? key : null;
}

const NONE: NatureRarity = { iucn: null, occurrences: null };

/** The category of an answer, `null` (unknown) for no hit or a category outside the known list. */
function readIucn(outcome: SourceOutcome): NatureRarity["iucn"] {
  const code = outcome.kind === "found" ? dig(outcome.data, "code") : undefined;
  return isCategory(code) ? { category: code, provenance: outcome.provenance } : null;
}

/** The count of an answer; 0 and no hit are unknown. */
function readCount(outcome: SourceOutcome): NatureRarity["occurrences"] {
  const n = outcome.kind === "found" ? outcome.data : undefined;
  return typeof n === "number" && Number.isInteger(n) && n > 0
    ? { count: n, provenance: outcome.provenance }
    : null;
}

/**
 * Rarity in nature of an accepted species name (US-POK-13), from GBIF only (no key needed): the IUCN Red List category
 * and the number of occurrence records. Only an exact species match counts; anything a source does not say stays
 * unknown (`null`, P-08). A source failure is an error, not an "unknown" (P-10).
 */
export async function natureRarity(
  sources: SourceClient,
  acceptedName: string,
): Promise<Result<NatureRarity>> {
  const match = await sources.get({
    source: "gbif",
    path: "/species/match",
    query: { name: acceptedName, rank: "SPECIES", kingdom: "Plantae" },
  });
  if (!match.ok) return match;
  const key = match.value.kind === "found" ? exactSpeciesKey(match.value.data) : null;
  if (key === null) return ok(NONE);
  const iucn = await sources.get({ source: "gbif", path: `/species/${key}/iucnRedListCategory` });
  if (!iucn.ok) return iucn;
  const count = await sources.get({
    source: "gbif",
    path: "/occurrence/count",
    query: { taxonKey: String(key) },
  });
  if (!count.ok) return count;
  return ok({ iucn: readIucn(iucn.value), occurrences: readCount(count.value) });
}
