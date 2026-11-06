import type { SpeciesValues } from "@pflanzendex/core";

// The read model of the species catalog (NFR-12, #1235): the columns, the rows a caller may see and the species search.
// The row rules themselves live in the database (migration 0102: plain predicates on the stored review status and creator).
/** Column per field (without synonyms: they live in `species_name`). */
export const COLUMN: Record<Exclude<keyof SpeciesValues, "synonyms">, string> = {
  latinName: "latin_name",
  genus: "genus",
  epithet: "epithet",
  cultivar: "cultivar",
  germanName: "german_name",
  englishName: "english_name",
  familyGerman: "family_german",
  familyLatin: "family_latin",
  difficulty: "difficulty",
  standardLevel: "standard_level",
  lightDemandLux: "light_demand_lux",
  softLeaf: "soft_leaf",
  dormancyFrom: "dormancy_from",
  dormancyUntil: "dormancy_until",
  locationHint: "location_hint",
  growthMeasure: "growth_measure",
  etiolationSigns: "etiolation_signs",
  wateringHint: "watering_hint",
  substrate: "substrate",
  pruning: "pruning",
  growthHacks: "growth_hacks",
  successCriteria: "success_criteria",
  botanicalStory: "botanical_story",
  source: "source",
};
export const FIELDS = Object.keys(COLUMN) as (keyof typeof COLUMN)[];

// Review status, creator and visibility are stored on the species row (migration 0102, NFR-12): the row rules are plain
// column predicates, so no lookup runs per species. The review case stays the source of truth (copied by triggers).
// Only a few per-row subqueries remain, and only for the own species (reason of a rejection, synonyms of the species).
export const SELECTION = `a.id, ${FIELDS.map((f) => `a.${COLUMN[f]} as "${f}"`).join(", ")},
  coalesce((select array_agg(n.display order by n.display) from species_name n
             where n.species_id = a.id and n.field = 'synonym'), '{}') as "synonyms",
  a.review_status as "reviewStatus",
  case when a.review_account = current_account() then
    (select v.reason from review_case v where v.object_kind = 'species' and v.object_id = a.id
        and v.account_id = current_account()) end as "reviewReason",
  a.created_by as "createdBy", coalesce(a.review_account = current_account(), false) as "own", a.version`;
// What the application shows: approved species and own proposals (FR-BES-11). Reviewers may additionally read foreign
// open proposals by row rule (US-BES-10); only `findForReview` asks for them.
export const VISIBLE =
  "a.review_status <> 'merged' and (a.review_status in ('curated', 'reviewed') or a.review_account = current_account())";
// A merged proposal is a duplicate that is gone for everybody, reviewers included.
export const NOT_MERGED = `not exists (select from review_case v where v.object_kind = 'species' and v.object_id = a.id and v.status = 'merged')`;

/**
 * The Pokedex facts of the approved species (US-POK-01): German name, difficulty and standard light zone, no cultivars.
 * Ordered by Latin name and id, so the rows come in the same order on every read (two approved species may share a
 * Latin name; the cards take the first). `SpeciesPostgres.approvedFacts` runs it; the NFR-12 scaling gate measures this
 * statement, so the two never drift.
 */
export const APPROVED_FACTS = `select a.latin_name as "latinName", a.german_name as "germanName", a.difficulty,
                a.standard_level as "lightZone"
           from species a
          where a.cultivar is null and a.review_status in ('curated', 'reviewed')
          order by a.latin_name, a.id`;

const mask = (norm: string) => `%${norm.replace(/[\\%_]/g, "\\$&")}%`;

/**
 * The visible cap of the species search (FR-BES-24): at most this many hits are shown. A starting value (assumption).
 * The search reads one row more to learn whether more species match; the rows past the cap are never shown.
 */
export const SEARCH_LIMIT = 50;

/** The rows of the species of a page (the ids and the matched name), read with the columns of `SELECTION`. */
const withSelection = (page: string) =>
  `select ${SELECTION}, p.field, p.display from (${page}) p
     join species a on a.id = p.id order by a.latin_name`;

/**
 * The species list and the search (`norm` null: the first visible species by name; otherwise the species with a name
 * that contains the normalized term). The search reads `species_name` first and only then the visible species; no
 * trigram index serves it under row security (open question, docs/guides/reference/app.md). Sorting and the cut come
 * before the per-species columns are read: the columns are computed for at most SEARCH_LIMIT + 1 species, never for the
 * whole visible catalog.
 */
export function searchQuery(norm: string | null): { text: string; values: unknown[] } {
  const page =
    norm === null
      ? `select a.id, null::text as field, null::text as display from species a
          where ${VISIBLE} order by a.latin_name limit ${SEARCH_LIMIT + 1}`
      : `select a.id, t.field, t.display from species a
           join lateral (select n.field, n.display from species_name n
              where n.species_id = a.id and n.norm like $1::text
              order by array_position(array['latin','german','english','synonym'], n.field) limit 1) t on true
          where ${VISIBLE} and a.id in (select n.species_id from species_name n where n.norm like $1::text)
          order by a.latin_name limit ${SEARCH_LIMIT + 1}`;
  return { text: withSelection(page), values: norm === null ? [] : [mask(norm)] };
}

/**
 * The visible species with a name (Latin, German, English or synonym) that equals `norm` as a whole (FR-BES-24). Same
 * visibility, columns and hit as `searchQuery`, but no cap: an exact match beyond the cap of the search is found too.
 * Only names equal to the term match, so the result stays as small as the number of identical names.
 */
export function exactQuery(norm: string): { text: string; values: unknown[] } {
  const page = `select a.id, t.field, t.display from species a
           join lateral (select n.field, n.display from species_name n
              where n.species_id = a.id and n.norm = $1::text
              order by array_position(array['latin','german','english','synonym'], n.field) limit 1) t on true
          where ${VISIBLE} and a.id in (select n.species_id from species_name n where n.norm = $1::text)`;
  return { text: withSelection(page), values: [norm] };
}
