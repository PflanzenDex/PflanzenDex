// The species of an import row (US-BES-18): only an exact name or synonym, ignoring case and accents, makes a row ready;
// the import never guesses (P-08). Partial matches and several exact ones are candidates the keeper chooses from. An
// import never creates a species (the usual proposal, US-BES-01, does that).
import { normalize } from "../../../../catalog";
import { normalizeName } from "../../../../kernel";
import { IMPORT_CANDIDATES, type ImportSpeciesSource, type SpeciesCandidate } from "../../types";

export type SpeciesMatch =
  | { readonly kind: "absent" }
  | { readonly kind: "ready"; readonly species: SpeciesCandidate }
  | {
      readonly kind: "candidates";
      readonly candidates: readonly SpeciesCandidate[];
      readonly more: boolean;
    }
  | { readonly kind: "none" };

/** The name a specimen of the species carries (DM-BES-03): German, else Latin (as `speciesDisplayName`). */
export const displayName = (species: SpeciesCandidate): string =>
  species.germanName ?? species.latinName;

const namesOf = (species: SpeciesCandidate): string[] =>
  [species.latinName, species.germanName, ...species.synonyms].filter(
    (name): name is string => name !== null,
  );

// The catalog lists a species once even when two of its names match; the first copy keeps its place.
const uniqueById = (list: readonly SpeciesCandidate[]): SpeciesCandidate[] => [
  ...new Map(list.map((species) => [species.id, species] as const)).values(),
];

const NONE: SpeciesMatch = { kind: "none" };

/**
 * Resolves one name of the file. The catalog looks up its own normal form (`normalize`); a hit counts only when the names of
 * the species, compared with `normalizeName`, equal the cell as a whole, and only if exactly one species qualifies. Any
 * other outcome asks the search for candidates.
 */
export async function matchSpecies(
  source: ImportSpeciesSource,
  userId: string,
  cell: string,
): Promise<SpeciesMatch> {
  if (cell === "") return { kind: "absent" };
  // A text the catalog has no letters or digits for has no hit; the search would list the whole catalog for it.
  if (normalize(cell) === "") return NONE;
  const want = normalizeName(cell);
  const exact = await source.exact(userId, cell);
  const verified = exact.filter((species) =>
    namesOf(species).some((n) => normalizeName(n) === want),
  );
  const [only] = verified;
  if (exact.length === 1 && verified.length === 1 && only) return { kind: "ready", species: only };
  const shown = await source.search(userId, cell);
  const all = uniqueById([...exact, ...shown.species]);
  if (all.length === 0) return NONE;
  return {
    kind: "candidates",
    candidates: all.slice(0, IMPORT_CANDIDATES),
    more: shown.more || all.length > IMPORT_CANDIDATES,
  };
}
