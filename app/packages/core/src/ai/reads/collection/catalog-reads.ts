// The species catalog through the AI interface (US-KI-11): search by Latin name, German name or synonym (the same search
// as the catalog of the app, US-BES-01) and one species by id or name, so a client sees "this species exists" before it
// proposes one. Only what the account may see: approved species and its own proposals (FR-BES-11, P-04).
import { appError, failed, isId, ok, shape, textField, type Result } from "../../../kernel";
import type { AiLogStore } from "../../status";
import { NAMING_LIMITS, normalizeName, referenceError, resolveName, type Named } from "../naming";
import {
  PAGE_FIELDS,
  pageOf,
  readCall,
  type CollectionReadSource,
  type Page,
  type ReadCall,
  type SpeciesItem,
} from "../types";

export interface ReadDependencies {
  readonly source: CollectionReadSource;
  readonly log: AiLogStore;
}

/** Free texts of a species item (FR-KI-07): names come from keepers' proposals. */
const SPECIES_DATA = ["germanName", "synonyms"] as const;

export const searchSpeciesSchema = shape({
  query: textField("query", { min: 2, max: 100 }),
  ...PAGE_FIELDS,
});
export const getSpeciesSchema = shape({ species: textField("species", { min: 1, max: 200 }) });

const byLatinName = (a: SpeciesItem, b: SpeciesItem) =>
  a.latinName.localeCompare(b.latinName) || a.id.localeCompare(b.id);

const named = (s: SpeciesItem): Named => ({
  id: s.id,
  label: s.germanName ? `${s.latinName} (${s.germanName})` : s.latinName,
  names: [s.latinName, ...(s.germanName ? [s.germanName] : []), ...s.synonyms],
});

/**
 * Species search of the app (US-BES-01), at least 2 characters, ordered by Latin name and paged (FR-KI-16). `more` says
 * that more species match than the list shows (FR-BES-24): a cut list never looks complete, and no count is guessed.
 */
export const aiSearchSpecies = (deps: ReadDependencies, call: ReadCall) =>
  readCall(deps, call, "search_species", {
    schema: searchSpeciesSchema,
    run: async (
      input,
    ): Promise<Result<Page<SpeciesItem> & { more: boolean; dataFields: readonly string[] }>> => {
      const found = await deps.source.searchSpecies(call.userId, input.query);
      const all = [...found.species].sort(byLatinName);
      return ok({
        ...pageOf(all, input),
        more: found.more,
        dataFields: SPECIES_DATA.map((f) => `items[].${f}`),
      });
    },
    effect: (v) => `${v.items.length} of ${v.total} species${v.more ? ", more match" : ""}`,
  });

/**
 * The visible species a name may mean: the app's search for the name, with an exact name beyond the cap of that search
 * added (FR-BES-24; the rule of the duplicate check, restated here because this module may not import the catalog),
 * else the search for the beginning of the name (nearest names). `more` is whether the search that gave the hits was
 * cut at the cap: a cut pool does not prove a single hit (FR-BES-24, KI-R4).
 */
async function speciesPool(
  deps: ReadDependencies,
  userId: string,
  ref: string,
): Promise<{ readonly hits: readonly SpeciesItem[]; readonly more: boolean }> {
  const shown = await deps.source.searchSpecies(userId, ref);
  const beyond = shown.more ? await deps.source.exactSpecies(userId, ref) : [];
  const hits = [
    ...shown.species,
    ...beyond.filter((b) => !shown.species.some((s) => s.id === b.id)),
  ];
  if (hits.length > 0) return { hits, more: shown.more };
  const start = normalizeName(ref).slice(0, NAMING_LIMITS.prefix);
  if (start.length < NAMING_LIMITS.minSearch) return { hits: [], more: false };
  const prefix = await deps.source.searchSpecies(userId, start);
  return { hits: prefix.species, more: prefix.more };
}

/** The id a species reference names (FR-KI-15), or the refusal with candidates or nearest names. */
export async function resolveSpecies(
  deps: ReadDependencies,
  userId: string,
  ref: string,
  field = "species",
): Promise<Result<string>> {
  if (isId(ref)) return ok(ref.toLowerCase());
  const pool = await speciesPool(deps, userId, ref);
  const r = resolveName(pool.hits.map(named), ref, pool.more);
  return r.kind === "found" ? ok(r.id) : failed(referenceError(r, field, "species.not_found"));
}

/** One species profile as the app shows it (US-BES-01), by id or by name; a foreign proposal is `not_found` (P-04). */
export const aiGetSpecies = (deps: ReadDependencies, call: ReadCall) =>
  readCall(deps, call, "get_species", {
    schema: getSpeciesSchema,
    run: async (input): Promise<Result<{ species: object; dataFields: readonly string[] }>> => {
      const id = await resolveSpecies(deps, call.userId, input.species);
      if (!id.ok) return id;
      const species = await deps.source.species(call.userId, id.value);
      if (!species) return failed(appError("species.not_found", { data: { nearest: [] } }));
      return ok({ species, dataFields: SPECIES_DATA.map((f) => `species.${f}`) });
    },
    effect: () => "one species",
  });
