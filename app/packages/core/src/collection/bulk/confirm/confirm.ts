// The confirmation of an import (US-BES-18, FR-BES-26): the one guarded write, operation `specimen.import`. Each row goes
// through the validating operation for specimens and each new location through the location operation (P-03). The client's
// data is never trusted: the schema and the operations check it again.
import {
  appError,
  calendarDateField,
  defineOperation,
  described,
  failed,
  idField,
  integerField,
  ok,
  orNull,
  shape,
  textField,
  timeZoneField,
  type ErrorDetail,
  type Result,
} from "../../../kernel";
import { LIGHT_LIMITS } from "../../../light";
import { notesField } from "../../notes/notes";
import { markerAnswersField, type MarkerAnswer } from "../../shared/markers";
import { isActive, SPECIMEN_LIMITS, type SpecimenRow } from "../../shared/types";
import { CSV_IMPORT_KEEPER_SWITCH, IMPORT_LIMITS } from "../types";
import { locationBook } from "./locations";
import { writeRows } from "./rows";
import type { ConfirmDependencies, ConfirmInput, ConfirmResult, ConfirmRow } from "./types";

const invalid = (field: string): ErrorDetail => ({ field, code: "input.invalid" });

const rowSchema = shape({
  line: integerField("line", { min: 1, max: 1_000_000 }),
  speciesId: idField("speciesId"),
  marker: orNull(textField("marker", SPECIMEN_LIMITS.marker)),
  locationId: orNull(idField("locationId")),
  newLocation: orNull(textField("newLocation", LIGHT_LIMITS.name)),
  catchDate: orNull(calendarDateField("catchDate")),
  notes: orNull(notesField("notes")),
});

// A broken row refuses the whole request before anything is written (P-03).
const rowsField = described(
  (value: unknown): ConfirmRow[] | ErrorDetail => {
    if (!Array.isArray(value) || value.length > IMPORT_LIMITS.rows) return invalid("rows");
    const rows: ConfirmRow[] = [];
    for (const item of value) {
      const parsed = rowSchema(item);
      if (!parsed.ok) return invalid("rows");
      rows.push(parsed.value);
    }
    return rows;
  },
  { type: "array", maxItems: IMPORT_LIMITS.rows },
);

const confirmSchema = shape({
  timeZone: timeZoneField("timeZone"),
  rows: rowsField,
  // Answers for existing specimens that need a marker; each goes to the row that makes the third active specimen.
  markers: markerAnswersField,
});

const keeperOff = () =>
  appError("onboarding.keeper_off", { data: { id: CSV_IMPORT_KEEPER_SWITCH } });

/** An answer names an existing active specimen without a marker, of a species the import writes. */
const answersAllowed = (
  answers: readonly MarkerAnswer[],
  specimens: readonly SpecimenRow[],
  speciesIds: ReadonlySet<string>,
): boolean =>
  answers.every((a) =>
    specimens.some(
      (z) =>
        z.id === a.specimenId && isActive(z) && z.marker === null && speciesIds.has(z.speciesId),
    ),
  );

async function confirmOf(
  deps: ConfirmDependencies,
  userId: string,
  input: ConfirmInput,
): Promise<Result<ConfirmResult>> {
  if (await deps.keeperOff(userId)) return failed(keeperOff());
  if (input.rows.some((r) => r.locationId !== null && r.newLocation !== null))
    return failed(appError("input.invalid", { details: [invalid("newLocation")] }));
  const [specimens, locations] = await Promise.all([
    deps.specimens.list(userId),
    deps.locations.list(userId),
  ]);
  const speciesIds = new Set(input.rows.map((r) => r.speciesId));
  if (!answersAllowed(input.markers, specimens, speciesIds))
    return failed(appError("specimen.not_found"));
  const book = locationBook(deps.locations, userId, locations);
  return ok(await writeRows(deps, { userId, input, specimens, book }));
}

/** The import as an operation. Its one call is guarded by the `Idempotency-Key` of the write (US-QS-03). */
export const specimenImport = (deps: ConfirmDependencies) =>
  defineOperation({
    name: "specimen.import",
    schema: confirmSchema,
    run: ({ userId }, input) => confirmOf(deps, userId, input),
  });
