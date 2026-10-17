import { appError, failed, isId } from "../../../../kernel";
import type { Result } from "../../../../kernel";
import type { SpecimenStore } from "../../../../collection";
import type { MeasurementStore } from "../../types";

export interface PhotoFileDependencies {
  readonly measurements: Pick<MeasurementStore, "list">;
  readonly specimens: Pick<SpecimenStore, "find">;
  /** Reads a stored object; structurally the `ObjectStore` of `media` (ADR 0003: no edge to `media`). */
  readonly objects: {
    get(
      accountId: string,
      name: string,
    ): Promise<Result<{ readonly bytes: Uint8Array; readonly contentType: string }>>;
  };
}

/**
 * The cleaned photo of a measurement (US-WAC-05, private by default P-05): only for the owner of the specimen. A
 * foreign specimen looks like a missing one (P-04); a measurement without a photo is `photo_not_found`.
 */
export async function measurementPhotoFile(
  deps: PhotoFileDependencies,
  userId: string,
  specimenId: string,
  measurementId: string,
): Promise<Result<{ readonly bytes: Uint8Array; readonly contentType: string }>> {
  if (!isId(specimenId)) return failed(appError("specimen.not_found"));
  const specimen = await deps.specimens.find(userId, specimenId.toLowerCase());
  if (!specimen) return failed(appError("specimen.not_found"));
  const rows = await deps.measurements.list(userId, specimen.id);
  const name = rows.find((m) => m.id === measurementId.toLowerCase())?.photo;
  if (!name) return failed(appError("measurement.photo_not_found"));
  return deps.objects.get(userId, name);
}
