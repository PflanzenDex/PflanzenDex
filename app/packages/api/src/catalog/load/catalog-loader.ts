import type { Pool } from "pg";
import { normalize, parseLatin } from "@pflanzendex/core";
import { CatalogLoadPostgres, ensureOperatorAccount } from "@pflanzendex/db";
import type { LoadRecord } from "@pflanzendex/db";
import type { StartSpecies } from "./start-species.ts";

/** The account the batch acts as; it has the `operator` role and cannot sign in (no identity knows its subject). */
export const OPERATOR_SUBJECT = "catalog-load";
/**
 * Marks every loaded species (P-08): names and family are operator-entered taxonomic facts; difficulty, default level
 * and lux need stay unknown (null) until a value with a source is entered (#1003). The fill job adds sourced fields later.
 * Same text as migration 0095 writes into rows it cleared.
 */
export const START_SOURCE =
  "Curated start catalog (operator): names and family are taxonomic facts, entered by the operator; difficulty and light need unknown until a source is given";
/** The operator releases its own entries as CC0 (names and taxonomy are facts). Assumption, revisable by the PO (E-25). */
export const START_LICENSE = "CC0-1.0";
const ETIOLATION_SIGNS = "Lange, helle Zwischenräume und blasse Triebe.";
const SUCCESS_CRITERIA = "Kompakter Neuaustrieb ohne Streckung.";

/** Turns the curated list into store records; throws for a row that is not a species name (nothing is stored then). */
export function prepareRecords(list: readonly StartSpecies[]): readonly LoadRecord[] {
  const seen = new Set<string>();
  return list.map((s) => {
    const parsed = parseLatin(s.latin);
    if (!parsed?.epithet || parsed.display !== s.latin)
      throw new Error(`not a species name: ${s.latin}`);
    if (seen.has(normalize(s.latin))) throw new Error(`listed twice: ${s.latin}`);
    seen.add(normalize(s.latin));
    const names: LoadRecord["names"][number][] = [
      { field: "latin", display: parsed.display, norm: normalize(s.latin) },
      ...(s.german
        ? [{ field: "german" as const, display: s.german, norm: normalize(s.german) }]
        : []),
      ...(s.english
        ? [{ field: "english" as const, display: s.english, norm: normalize(s.english) }]
        : []),
      ...s.synonyms.map((x) => ({ field: "synonym" as const, display: x, norm: normalize(x) })),
    ];
    return {
      latinName: parsed.display,
      genus: parsed.genus,
      epithet: parsed.epithet,
      germanName: s.german,
      englishName: s.english,
      familyLatin: s.familyLatin,
      familyGerman: s.familyGerman,
      growthMeasure: "height",
      etiolationSigns: ETIOLATION_SIGNS,
      successCriteria: SUCCESS_CRITERIA,
      source: START_SOURCE,
      names,
    };
  });
}

export interface LoadPlan {
  readonly records: readonly LoadRecord[];
  readonly fresh: readonly LoadRecord[];
  readonly present: readonly LoadRecord[];
}

/** Read only: which species of the list are new and which are in the catalog already. Writes nothing. */
export async function planLoad(pool: Pool, list: readonly StartSpecies[]): Promise<LoadPlan> {
  const records = prepareRecords(list);
  const known = await new CatalogLoadPostgres(pool).presentLatin(
    records.map((r) => normalize(r.latinName)),
  );
  const isPresent = (r: LoadRecord) => known.has(normalize(r.latinName));
  return {
    records,
    fresh: records.filter((r) => !isPresent(r)),
    present: records.filter(isPresent),
  };
}

/** Writes the new species in one transaction (all or nothing) and returns their Latin names. */
export async function applyLoad(
  pool: Pool,
  plan: LoadPlan,
  today: string,
): Promise<readonly string[]> {
  if (plan.fresh.length === 0) return [];
  const operator = await ensureOperatorAccount(pool, OPERATOR_SUBJECT);
  return new CatalogLoadPostgres(pool).load(operator, plan.records, {
    license: START_LICENSE,
    retrievedOn: today,
  });
}
