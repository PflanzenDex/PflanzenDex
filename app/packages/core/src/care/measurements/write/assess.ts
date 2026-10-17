import {
  appError,
  choiceField,
  defineOperation,
  failed,
  idField,
  ok,
  orNull,
  shape,
  textField,
} from "../../../kernel";
import type { SpecimenStore } from "../../../collection";
import { measurementPhotoFile, type PhotoFileDependencies } from "../capture/file";
import { MEASUREMENT_LIMITS, QUALITIES, type MeasurementStore } from "../types";

export interface AssessDependencies {
  readonly measurements: Pick<MeasurementStore, "get" | "assess">;
  readonly specimens: Pick<SpecimenStore, "find">;
}

const schema = shape({
  measurementId: idField("measurementId"),
  quality: choiceField("quality", QUALITIES),
  note: orNull(textField("note", MEASUREMENT_LIMITS.note)),
  aiSuggestion: orNull((value: unknown) =>
    value === true || value === false ? value : { field: "aiSuggestion", code: "input.invalid" },
  ),
});

/**
 * Sets the quality and the note of an existing measurement that has a photo (US-WAC-02, US-KI-04). The keeper's own
 * assessment is `Assessed_By: keeper`; a suggestion of the AI client that the keeper adopts is `ai_adopted`
 * (`aiSuggestion: true`, US-KI-09). Only what is visible is assessed, nothing else changes (the value stays). A foreign or
 * unknown measurement looks the same (P-04); an archived specimen is read only; without a photo there is nothing to assess.
 */
export const measurementAssess = (deps: AssessDependencies) =>
  defineOperation({
    name: "measurement.assess",
    schema,
    run: async ({ userId }, input) => {
      const m = await deps.measurements.get(userId, input.measurementId);
      if (!m) return failed(appError("measurement.not_found"));
      const specimen = await deps.specimens.find(userId, m.specimenId);
      if (!specimen) return failed(appError("specimen.not_found"));
      if (specimen.status === "archived") return failed(appError("specimen.archived"));
      if (!m.photo) return failed(appError("measurement.photo_not_found"));
      const ratedBy = input.aiSuggestion === true ? ("ai_adopted" as const) : ("keeper" as const);
      const done = await deps.measurements.assess(userId, m.id, {
        quality: input.quality,
        note: input.note,
        ratedBy,
      });
      return done
        ? ok({ id: m.id, quality: input.quality, note: input.note, ratedBy })
        : failed(appError("measurement.not_found"));
    },
  });

/** The cleaned photo of a measurement by its id (US-KI-04), for the owner only; the specimen follows from the row. */
export async function measurementPhotoById(
  deps: PhotoFileDependencies & { readonly measurements: Pick<MeasurementStore, "list" | "get"> },
  userId: string,
  measurementId: string,
) {
  const m = await deps.measurements.get(userId, measurementId.toLowerCase());
  return m
    ? measurementPhotoFile(deps, userId, m.specimenId, m.id)
    : failed(appError("measurement.not_found"));
}
