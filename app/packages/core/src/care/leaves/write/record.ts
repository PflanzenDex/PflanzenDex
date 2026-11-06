// Records a leaf (US-WAC-07): one tap is enough; a size, a note or an earlier date are optional. Writes go through
// `leaf.record` only (P-03). Sizes and the note answer with codes of their own (`leaf.size_invalid`, `leaf.note_invalid`).
import {
  appError,
  calendarDateField,
  defineOperation,
  failed,
  idField,
  localToday,
  ok,
  orNull,
  shape,
  timeZoneField,
  type Result,
  type Schema,
} from "../../../kernel";
import type { SpecimenStore } from "../../../collection";
import { LEAF_KEEPER_SWITCH, LEAF_LIMITS, type LeafStore } from "../types";

export interface LeafRecordDependencies {
  readonly leaves: LeafStore;
  readonly specimens: Pick<SpecimenStore, "find">;
  /** Whether the keeper switched the leaf log off (US-ONB-09); the answer comes from the switch store. */
  readonly keeperOff: (userId: string) => Promise<boolean>;
  /** The clock comes from outside so that "today" is testable (NFR-08). */
  readonly clock: () => Date;
}

export interface LeafInput {
  readonly specimenId: string;
  readonly timeZone: string;
  readonly date: string | null;
  readonly lengthMm: number | null;
  readonly widthMm: number | null;
  readonly note: string | null;
}

// The identifiers, the time zone and the calendar date share the usual checks (`input.invalid`, per field).
const fields = shape({
  specimenId: idField("specimenId"),
  timeZone: timeZoneField("timeZone"),
  date: orNull(calendarDateField("date")),
});

const isSize = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= LEAF_LIMITS.size.min &&
  value <= LEAF_LIMITS.size.max;

/** A size is missing (null or not sent) or a whole number of millimetres within the limits. */
function sizeOf(field: "lengthMm" | "widthMm", value: unknown): Result<number | null> {
  if (value === undefined || value === null) return ok(null);
  if (isSize(value)) return ok(value);
  return failed(appError("leaf.size_invalid", { details: [{ field, code: "leaf.size_invalid" }] }));
}

/** A note is missing or non-blank text of 1 to 500 characters after trimming (code points, not bytes). */
function noteOf(value: unknown): Result<string | null> {
  if (value === undefined || value === null) return ok(null);
  const text = typeof value === "string" ? value.trim() : "";
  const length = [...text].length;
  if (length >= LEAF_LIMITS.note.min && length <= LEAF_LIMITS.note.max) return ok(text);
  return failed(
    appError("leaf.note_invalid", { details: [{ field: "note", code: "leaf.note_invalid" }] }),
  );
}

/** The optional sizes and note, each with its own code (US-WAC-07); the first bad one answers. */
function optionalFields(source: Record<string, unknown>) {
  const lengthMm = sizeOf("lengthMm", source["lengthMm"]);
  if (!lengthMm.ok) return lengthMm;
  const widthMm = sizeOf("widthMm", source["widthMm"]);
  if (!widthMm.ok) return widthMm;
  const note = noteOf(source["note"]);
  if (!note.ok) return note;
  return ok({ lengthMm: lengthMm.value, widthMm: widthMm.value, note: note.value });
}

const schema: Schema<LeafInput> = (input) => {
  const base = fields(input);
  if (!base.ok) return base;
  const rest = optionalFields(input as Record<string, unknown>);
  if (!rest.ok) return rest;
  return ok({ ...base.value, ...rest.value });
};

const future = failed(
  appError("leaf.date_in_future", { details: [{ field: "date", code: "leaf.date_in_future" }] }),
);

/**
 * Records a leaf of a plant (US-WAC-07). The date defaults to today in the keeper's time zone (NFR-08) and may be an
 * earlier day; a future date is refused (`leaf.date_in_future`). Sizes are whole millimetres from 1 to 5,000, the note
 * at most 500 characters (starting values). A foreign or unknown plant is `specimen.not_found` and an archived one is
 * `specimen.archived`; with the keeper switch off nothing is written (`onboarding.keeper_off`, P-12). Nothing is written
 * for a refusal.
 */
export const leafRecord = (deps: LeafRecordDependencies) =>
  defineOperation({
    name: "leaf.record",
    schema,
    run: async ({ userId }, input) => {
      if (await deps.keeperOff(userId))
        return failed(appError("onboarding.keeper_off", { data: { id: LEAF_KEEPER_SWITCH } }));
      const specimen = await deps.specimens.find(userId, input.specimenId);
      if (!specimen) return failed(appError("specimen.not_found"));
      // Archived means `archived_at` is set: the database keeps both together (specimen_archive_together, migration 0012).
      if (specimen.archivedAt !== null) return failed(appError("specimen.archived"));
      const today = localToday(deps.clock(), input.timeZone);
      const date = input.date ?? today;
      if (date > today) return future;
      const r = await deps.leaves.create(userId, {
        specimenId: specimen.id,
        date,
        lengthMm: input.lengthMm,
        widthMm: input.widthMm,
        note: input.note,
      });
      return r === "specimen_unknown" ? failed(appError("specimen.not_found")) : ok(r);
    },
  });
