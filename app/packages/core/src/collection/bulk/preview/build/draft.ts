// One draft per row of the file (US-BES-18): the species the name matches, the values and the reasons the row is flagged for
// on its own, and whether the specimen it names already exists (archived ones included, so a second import creates nothing
// twice). Each distinct species name is looked up once, however often it stands in the file.
import { isActive, type SpecimenRow } from "../../../shared/types";
import { specimenName } from "../../../shared/name";
import type { LightLocation } from "../../../../light";
import type { ImportSpeciesSource, ParsedRow } from "../../types";
import {
  checkRow,
  displayName,
  matchSpecies,
  type Reason,
  type RowValues,
  type SpeciesMatch,
} from "../rules";

export interface Draft {
  readonly row: ParsedRow;
  readonly match: SpeciesMatch;
  readonly values: RowValues;
  /** The reasons from the species and the row itself; the file as a whole may add more (`plan.ts`). */
  readonly reasons: readonly Reason[];
  /** The name the specimen would get (DM-BES-03): only with a known species and a valid marker. */
  readonly name: string | null;
  /** A specimen of the species carries this name already (archived ones included). */
  readonly already: boolean;
}

const speciesReason = (match: SpeciesMatch): Reason | null => {
  if (match.kind === "ready") return null;
  if (match.kind === "absent") return { code: "import.species_missing", field: "species" };
  if (match.kind === "none") return { code: "import.species_not_found", field: "species" };
  return { code: "import.species_candidates", field: "species" };
};

/** Whether the nickname was refused by its check (an invalid marker has no name, so no existing one can match it). */
const markerRefused = (reasons: readonly Reason[]): boolean =>
  reasons.some((r) => r.field === "nickname");

/** The shared species lookups: one per distinct name of the file, in parallel. */
async function matchesOf(
  source: ImportSpeciesSource,
  userId: string,
  cells: readonly string[],
): Promise<ReadonlyMap<string, SpeciesMatch>> {
  const distinct = [...new Set(cells)];
  const matches = await Promise.all(distinct.map((cell) => matchSpecies(source, userId, cell)));
  return new Map(distinct.map((cell, i) => [cell, matches[i] ?? { kind: "none" }] as const));
}

/** The draft of one row: its checks, its name and whether the specimen exists already. */
function draftOf(args: {
  readonly row: ParsedRow;
  readonly match: SpeciesMatch;
  readonly today: string;
  readonly locations: readonly LightLocation[];
  readonly specimens: readonly SpecimenRow[];
}): Draft {
  const { row, match, today, locations, specimens } = args;
  const checked = checkRow(row, today, locations);
  const reasons = [speciesReason(match), ...checked.reasons].flatMap((r) => (r ? [r] : []));
  const species = match.kind === "ready" ? match.species : null;
  const name =
    species && !markerRefused(reasons)
      ? specimenName(displayName(species), checked.values.marker)
      : null;
  const already =
    species !== null &&
    name !== null &&
    specimens.some(
      (z) => z.speciesId === species.id && z.name.toLowerCase() === name.toLowerCase(),
    );
  return { row, match, values: checked.values, reasons, name, already };
}

/**
 * The drafts of the whole file, in file order. A line the keeper chose a species for takes that match (US-BES-18); the
 * other names are looked up by name, each distinct one once.
 */
export async function draftsOf(args: {
  readonly source: ImportSpeciesSource;
  readonly userId: string;
  readonly rows: readonly ParsedRow[];
  readonly today: string;
  readonly locations: readonly LightLocation[];
  readonly specimens: readonly SpecimenRow[];
  readonly chosen: ReadonlyMap<number, SpeciesMatch>;
}): Promise<Draft[]> {
  const { source, userId, rows, today, locations, specimens, chosen } = args;
  const matches = await matchesOf(
    source,
    userId,
    rows.filter((r) => !chosen.has(r.line)).map((r) => r.species),
  );
  return rows.map((row) =>
    draftOf({
      row,
      match: chosen.get(row.line) ?? matches.get(row.species) ?? { kind: "none" },
      today,
      locations,
      specimens,
    }),
  );
}

/** Whether a draft names a species that exists (the write would go to it). */
export const speciesIdOf = (draft: Draft): string | null =>
  draft.match.kind === "ready" ? draft.match.species.id : null;

/** The existing specimens of a species, and the active ones among them. */
export const siblingsOf = (specimens: readonly SpecimenRow[], speciesId: string) => {
  const siblings = specimens.filter((z) => z.speciesId === speciesId);
  return { siblings, active: siblings.filter(isActive) };
};
