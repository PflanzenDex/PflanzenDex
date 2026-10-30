import type { Pool } from "pg";
import { normalize, parseLatin, type AttributeFact } from "@pflanzendex/core";
import {
  CatalogLoadPostgres,
  ensureOperatorAccount,
  saveAttributeFacts,
  TaxonAttributesPostgres,
} from "@pflanzendex/db";
import type { AttributeFactRecord, LoadRecord } from "@pflanzendex/db";
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
      source: START_SOURCE,
      names,
    };
  });
}

/** Researched attribute values of the data files compared with the stored ones (US-ENT-09). */
export interface AttributePlan {
  /** New or changed values: the load writes these (a newer research replaces the stored value, never duplicates it). */
  readonly write: readonly AttributeFact[];
  readonly fresh: number;
  readonly changed: number;
  readonly unchanged: number;
}

export interface LoadPlan {
  readonly records: readonly LoadRecord[];
  readonly fresh: readonly LoadRecord[];
  readonly present: readonly LoadRecord[];
  readonly attributes: AttributePlan;
}

const key = (f: { species: string; field: string }) => `${f.species}\u0000${f.field}`;
const same = (a: AttributeFact, b: AttributeFactRecord) =>
  JSON.stringify(a.value) === JSON.stringify(b.value) &&
  a.evidence.source === b.evidence.source &&
  a.evidence.url === b.evidence.url &&
  a.evidence.license === b.evidence.license &&
  a.evidence.retrievedAt === b.evidence.retrievedAt;

/** Read only: which checked values are new, changed or already stored as they are. */
async function planAttributes(pool: Pool, facts: readonly AttributeFact[]): Promise<AttributePlan> {
  const names = [...new Set(facts.map((f) => f.species))];
  const stored = new Map(
    (await new TaxonAttributesPostgres(pool).forSpecies(names)).map((r) => [key(r), r]),
  );
  const fresh = facts.filter((f) => !stored.has(key(f)));
  const changed = facts.filter((f) => {
    const old = stored.get(key(f));
    return old !== undefined && !same(f, old);
  });
  return {
    write: [...fresh, ...changed],
    fresh: fresh.length,
    changed: changed.length,
    unchanged: facts.length - fresh.length - changed.length,
  };
}

/**
 * Read only: which species of the list are new and which are in the catalog already, and which researched values
 * (already checked by `catalog:check-data`) would be written. Writes nothing.
 */
export async function planLoad(
  pool: Pool,
  list: readonly StartSpecies[],
  facts: readonly AttributeFact[] = [],
): Promise<LoadPlan> {
  const records = prepareRecords(list);
  const known = await new CatalogLoadPostgres(pool).presentLatin(
    records.map((r) => normalize(r.latinName)),
  );
  const isPresent = (r: LoadRecord) => known.has(normalize(r.latinName));
  return {
    records,
    fresh: records.filter((r) => !isPresent(r)),
    present: records.filter(isPresent),
    attributes: await planAttributes(pool, facts),
  };
}

/**
 * Writes the new species and the new or changed attribute values in one transaction (all or nothing) and returns the
 * Latin names of the new species. Every value counts as "ungeprüft" until a reviewer confirms it (US-ENT-09).
 */
export async function applyLoad(
  pool: Pool,
  plan: LoadPlan,
  today: string,
): Promise<readonly string[]> {
  if (plan.fresh.length === 0 && plan.attributes.write.length === 0) return [];
  const operator = await ensureOperatorAccount(pool, OPERATOR_SUBJECT);
  const write = plan.attributes.write;
  return new CatalogLoadPostgres(pool).load(
    operator,
    plan.records,
    { license: START_LICENSE, retrievedOn: today },
    write.length > 0 ? (client) => saveAttributeFacts(client, write) : undefined,
  );
}
