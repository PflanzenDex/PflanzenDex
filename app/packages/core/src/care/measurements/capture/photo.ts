import {
  defineOperation,
  appError,
  failed,
  localToday,
  idField,
  shape,
  ok,
  orNull,
  timeZoneField,
} from "../../../kernel";
import type { ErrorDetail, Result } from "../../../kernel";
import type { SpecimenStore } from "../../../collection";
import { dateField } from "../../shared/fields";
import type { MeasurementRow, MeasurementStore } from "../types";

/**
 * What `care` needs from the media pipeline (structurally the `ImageStorage` of `media`, which the API passes in):
 * process and store an upload, delete a stored image. `care` has no edge to `media` (ADR 0003).
 */
export interface PhotoStorage {
  put(
    accountId: string,
    name: string,
    upload: { readonly bytes: Uint8Array; readonly contentType: string },
  ): Promise<Result<{ readonly width: number; readonly height: number }>>;
  remove(accountId: string, name: string): Promise<Result<void>>;
}

export interface PhotoDependencies {
  readonly measurements: MeasurementStore;
  readonly specimens: Pick<SpecimenStore, "find">;
  readonly storage: PhotoStorage;
  /** A new, unique object name without extension (a UUID); randomness comes from outside. */
  readonly newName: () => string;
  /** The clock comes from outside so that "today" is testable (NFR-08). */
  readonly clock: () => Date;
  /** The uploaded file. It is not part of the input: the fingerprint of the repeat guard uses `digest` instead. */
  readonly upload: { readonly bytes: Uint8Array; readonly contentType: string };
}

/** The repeat guard (US-QS-03) compares a hash of the file, not megabytes of bytes. */
const digestField = (field: string) => (value: unknown) =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
    ? value
    : ({ field, code: "input.invalid" } satisfies ErrorDetail);

const flagField = (field: string) => (value: unknown) =>
  value === undefined || value === null || typeof value === "boolean"
    ? (value ?? false)
    : ({ field, code: "input.invalid" } satisfies ErrorDetail);

const schema = shape({
  specimenId: idField("specimenId"),
  timeZone: timeZoneField("timeZone"),
  date: orNull(dateField("date")),
  /** The keeper confirmed that an existing photo of the measurement is replaced. */
  replace: flagField("replace"),
  digest: digestField("digest"),
});

export interface PhotoResult {
  readonly measurementId: string;
  readonly date: string;
  readonly photo: string;
  readonly width: number;
  readonly height: number;
  readonly replaced: boolean;
}

/** The measurement the photo belongs to: specimen of the account, not archived, date not in the future, measurement exists. */
async function findTarget(
  deps: PhotoDependencies,
  userId: string,
  input: { specimenId: string; timeZone: string; date: string | null },
): Promise<Result<MeasurementRow>> {
  const specimen = await deps.specimens.find(userId, input.specimenId);
  if (!specimen) return failed(appError("specimen.not_found"));
  if (specimen.status === "archived") return failed(appError("specimen.archived"));
  const today = localToday(deps.clock(), input.timeZone);
  const date = input.date ?? today;
  if (date > today)
    return failed(
      appError("input.invalid", { details: [{ field: "date", code: "input.invalid" }] }),
    );
  const measurement = await deps.measurements.findOnDate(userId, specimen.id, date);
  return measurement ? ok(measurement) : failed(appError("measurement.not_found"));
}

/**
 * Stores the photo of a measurement (US-WAC-06, FR-WAC-09). The photo belongs to the measurement of the given day
 * (default today in the user's time zone; with several that day the one recorded last). Without a measurement nothing
 * is stored (`measurement.not_found`). A second photo replaces the first only with `replace` = true, otherwise
 * `measurement.photo_exists` and the old photo stays. Only the processed image is stored (rotated, at most 1600 px,
 * JPEG 82, no EXIF/GPS); invalid or too large files are refused by the media pipeline. The new object is written first
 * and the old one deleted after the row points to the new one, so a failure never leaves a measurement without its photo.
 * The AI assessment of the photo is US-KI-04 and is not part of this operation.
 */
export const measurementPhoto = (deps: PhotoDependencies) =>
  defineOperation({
    name: "measurement.photo",
    schema,
    run: async ({ userId }, input) => {
      const target = await findTarget(deps, userId, input);
      if (!target.ok) return target;
      const measurement = target.value;
      if (measurement.photo && !input.replace) return failed(appError("measurement.photo_exists"));
      const name = `${deps.newName()}.jpg`;
      const stored = await deps.storage.put(userId, name, deps.upload);
      if (!stored.ok) return stored;
      if (!(await deps.measurements.setPhoto(userId, measurement.id, name))) {
        await deps.storage.remove(userId, name);
        return failed(appError("measurement.not_found"));
      }
      // The old object is unreferenced now; a failed delete only leaves an orphan, never a wrong photo.
      if (measurement.photo) await deps.storage.remove(userId, measurement.photo);
      return ok<PhotoResult>({
        measurementId: measurement.id,
        date: measurement.date,
        photo: name,
        width: stored.value.width,
        height: stored.value.height,
        replaced: measurement.photo !== null,
      });
    },
  });
