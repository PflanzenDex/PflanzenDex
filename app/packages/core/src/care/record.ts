import {
  defineOperation,
  appError,
  failed,
  localToday,
  idField,
  shape,
  ok,
  orNull,
  textField,
  choiceField,
  timeZoneField,
} from "../kernel";
import type { SpecimenStore } from "../collection";
import { dateField, gridField } from "./fields";
import { MEASUREMENT_LIMITS, QUALITIES } from "./types";
import type { MeasurementStore } from "./types";

export interface RecordDependencies {
  readonly measurements: MeasurementStore;
  readonly specimens: Pick<SpecimenStore, "find">;
  /** The clock comes from outside so that "today" is testable (NFR-08). */
  readonly clock: () => Date;
}

// For now the device sends the time zone (the profile has none yet, US-ACC-02); it determines "today".
const schema = shape({
  specimenId: idField("specimenId"),
  timeZone: timeZoneField("timeZone"),
  date: orNull(dateField("date")),
  value: gridField("value", MEASUREMENT_LIMITS.value, MEASUREMENT_LIMITS.step),
  quality: orNull(choiceField("quality", QUALITIES)),
  note: orNull(textField("note", MEASUREMENT_LIMITS.note)),
});

const future = failed(
  appError("input.invalid", { details: [{ field: "date", code: "input.invalid" }] }),
);

/**
 * Records a measurement (US-WAC-01). The date defaults to today in the user's time zone and can be changed
 * (back-filling); a date in the future is rejected (assumption: a typo in the year would distort every later rate).
 * Without a statement the quality is `healthy` (US-WAC-02). A foreign or unknown specimen looks the same:
 * `specimen.not_found`, nothing is written (P-04). The photo is still missing (media processing, FR-WAC-09).
 */
export const measurementRecord = (deps: RecordDependencies) =>
  defineOperation({
    name: "measurement.record",
    schema,
    run: async ({ userId }, input) => {
      const specimen = await deps.specimens.find(userId, input.specimenId);
      if (!specimen) return failed(appError("specimen.not_found"));
      if (specimen.status === "archived") return failed(appError("specimen.archived"));
      const today = localToday(deps.clock(), input.timeZone);
      const date = input.date ?? today;
      if (date > today) return future;
      const r = await deps.measurements.create(userId, {
        specimenId: specimen.id,
        date,
        value: input.value,
        quality: input.quality ?? "healthy",
        note: input.note,
        ratedBy: "keeper",
      });
      return r === "specimen_unknown" ? failed(appError("specimen.not_found")) : ok(r);
    },
  });
