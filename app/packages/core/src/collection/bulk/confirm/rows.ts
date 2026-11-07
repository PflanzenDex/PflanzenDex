// The rows of a confirmed import (US-BES-18), one by one in order. A specimen of the same name is there already: the row is
// skipped. A new location is resolved once. Every row goes through the validating operation for specimens (P-03). Nothing is
// rolled back: a refused row does not stop the others, and a repeat creates nothing twice.
import type { ErrorCode, Result } from "../../../kernel";
import type { MarkerAnswer } from "../../shared/markers";
import { specimenName, speciesDisplayName } from "../../shared/name";
import { isActive, type SpecimenRow } from "../../shared/types";
import { specimenCreate } from "../../specimen/create";
import { ACTIVE_FOR_MARKERS } from "../types";
import type { LocationBook } from "./locations";
import type {
  ConfirmDependencies,
  ConfirmInput,
  ConfirmResult,
  ConfirmRow,
  Created,
} from "./types";

/** The location of a row: its ID as given (the create checks it), or the keeper's location of that name (created once). */
type Place = { readonly id: string | null } | { readonly code: ErrorCode };
/** A specimen name as the import knows it: the species and the name (existing ones, and the ones this import created). */
type Seen = { readonly speciesId: string; readonly name: string };

/** The active specimens per species now, and the answers per species, held until the row that needs them. */
function startOf(specimens: readonly SpecimenRow[], answers: readonly MarkerAnswer[]) {
  const active = new Map<string, number>();
  for (const z of specimens)
    if (isActive(z)) active.set(z.speciesId, (active.get(z.speciesId) ?? 0) + 1);
  const pending = new Map<string, MarkerAnswer[]>();
  for (const a of answers) {
    const speciesId = specimens.find((z) => z.id === a.specimenId)?.speciesId ?? "";
    pending.set(speciesId, [...(pending.get(speciesId) ?? []), a]);
  }
  return { active, pending };
}

const placeOf = (book: LocationBook, row: ConfirmRow): Promise<Place> =>
  row.newLocation !== null
    ? book.resolve(row.newLocation)
    : Promise.resolve({ id: row.locationId });

/** One row through the validating operation for specimens (P-03): its schema first, then the operation itself. */
async function createRow(
  deps: ConfirmDependencies,
  call: {
    readonly userId: string;
    readonly timeZone: string;
    readonly row: ConfirmRow;
    readonly place: string | null;
    readonly markers: readonly MarkerAnswer[];
  },
): Promise<Result<{ readonly id: string; readonly name: string }>> {
  const { userId, timeZone, row, place, markers } = call;
  const create = specimenCreate(deps);
  const input = create.schema({
    speciesId: row.speciesId,
    timeZone,
    marker: row.marker,
    markers,
    locationId: place,
    lightZoneId: null,
    notes: row.notes,
    catchDate: row.catchDate,
  });
  if (!input.ok) return input;
  return create.run({ userId }, input.value);
}

/**
 * Whether a specimen of the row's species carries the name the row would get (DM-BES-03), archived ones and the ones this
 * import created included. An unknown species is no match here: the create refuses it with `species.not_found`.
 */
async function alreadyThere(
  deps: ConfirmDependencies,
  userId: string,
  row: ConfirmRow,
  seen: readonly Seen[],
): Promise<boolean> {
  const species = await deps.species.find(userId, row.speciesId);
  if (!species) return false;
  const name = specimenName(speciesDisplayName(species), row.marker).toLowerCase();
  return seen.some((z) => z.speciesId === row.speciesId && z.name.toLowerCase() === name);
}

/** The running tally of the import: what is written, skipped and refused, and the state the next row sees. */
interface Tally {
  readonly active: Map<string, number>;
  readonly pending: Map<string, MarkerAnswer[]>;
  readonly seen: Seen[];
  readonly created: Created[];
  readonly skipped: { line: number }[];
  readonly refused: { line: number; code: ErrorCode }[];
}

/** The answers that go to this row: all answers of its species, at the row that makes the third active specimen (US-BES-03). */
const answersFor = (tally: Tally, row: ConfirmRow): MarkerAnswer[] => {
  const count = tally.active.get(row.speciesId) ?? 0;
  return count + 1 >= ACTIVE_FOR_MARKERS ? (tally.pending.get(row.speciesId) ?? []) : [];
};

/** Records the outcome of one create. A name that is taken counts as skipped (the specimen is there already). */
function settle(
  tally: Tally,
  row: ConfirmRow,
  r: Result<{ readonly id: string; readonly name: string }>,
  answers: readonly MarkerAnswer[],
): void {
  if (r.ok) {
    tally.created.push({ line: row.line, id: r.value.id, name: r.value.name });
    tally.seen.push({ speciesId: row.speciesId, name: r.value.name });
    tally.active.set(row.speciesId, (tally.active.get(row.speciesId) ?? 0) + 1);
    if (answers.length > 0) tally.pending.set(row.speciesId, []);
  } else if (r.error.code === "specimen.name_taken") tally.skipped.push({ line: row.line });
  else tally.refused.push({ line: row.line, code: r.error.code });
}

/** One row: skipped, refused on its location, or created or refused by the create. */
async function writeOne(
  deps: ConfirmDependencies,
  call: { readonly userId: string; readonly timeZone: string; readonly book: LocationBook },
  row: ConfirmRow,
  tally: Tally,
): Promise<void> {
  if (await alreadyThere(deps, call.userId, row, tally.seen)) {
    tally.skipped.push({ line: row.line });
    return;
  }
  const place = await placeOf(call.book, row);
  if ("code" in place) {
    tally.refused.push({ line: row.line, code: place.code });
    return;
  }
  const answers = answersFor(tally, row);
  const r = await createRow(deps, {
    userId: call.userId,
    timeZone: call.timeZone,
    row,
    place: place.id,
    markers: answers,
  });
  settle(tally, row, r, answers);
}

/** Writes the rows in order and tallies every outcome. */
export async function writeRows(
  deps: ConfirmDependencies,
  call: {
    readonly userId: string;
    readonly input: ConfirmInput;
    readonly specimens: readonly SpecimenRow[];
    readonly book: LocationBook;
  },
): Promise<ConfirmResult> {
  const { active, pending } = startOf(call.specimens, call.input.markers);
  const tally: Tally = {
    active,
    pending,
    seen: call.specimens.map((z) => ({ speciesId: z.speciesId, name: z.name })),
    created: [],
    skipped: [],
    refused: [],
  };
  const context = { userId: call.userId, timeZone: call.input.timeZone, book: call.book };
  for (const row of call.input.rows) await writeOne(deps, context, row, tally);
  const unusedMarkers = [...pending.values()].flat().map((a) => a.specimenId);
  return {
    created: tally.created,
    skipped: tally.skipped,
    refused: tally.refused,
    locationsCreated: call.book.created,
    unusedMarkers,
  };
}
