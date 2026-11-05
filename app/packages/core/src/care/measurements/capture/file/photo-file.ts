import { appError, failed, isId, photoSize } from "../../../../kernel";
import type { PhotoSize, Result } from "../../../../kernel";
import type { SpecimenStore } from "../../../../collection";
import type { MeasurementStore } from "../../types";

export interface PhotoFileDependencies {
  readonly measurements: Pick<MeasurementStore, "list">;
  readonly specimens: Pick<SpecimenStore, "find">;
  /** Reads a stored image in a size; structurally the `ImageReader` of `media` (ADR 0003: no edge to `media`). */
  readonly images: {
    read(
      accountId: string,
      name: string,
      size: PhotoSize,
    ): Promise<Result<{ readonly bytes: Uint8Array; readonly contentType: string }>>;
  };
}

/** The photo asked for: the measurement of a specimen, in the sizes asked (none means the stored copy, NFR-12). */
export interface PhotoTarget {
  readonly specimenId: string;
  readonly measurementId: string;
  readonly sizes?: readonly string[];
}

/**
 * The cleaned photo of a measurement (US-WAC-05, private by default P-05): only for the owner of the specimen. A
 * foreign specimen looks like a missing one (P-04); a measurement without a photo is `photo_not_found`. `sizes` picks
 * the thumbnail for tiles and cards (NFR-12); without it the stored copy is answered, as the AI assessment reads it.
 */
export async function measurementPhotoFile(
  deps: PhotoFileDependencies,
  userId: string,
  target: PhotoTarget,
): Promise<Result<{ readonly bytes: Uint8Array; readonly contentType: string }>> {
  const wanted = photoSize(target.sizes ?? []);
  if (!wanted.ok) return wanted;
  if (!isId(target.specimenId)) return failed(appError("specimen.not_found"));
  const specimen = await deps.specimens.find(userId, target.specimenId.toLowerCase());
  if (!specimen) return failed(appError("specimen.not_found"));
  const rows = await deps.measurements.list(userId, specimen.id);
  const name = rows.find((m) => m.id === target.measurementId.toLowerCase())?.photo;
  if (!name) return failed(appError("measurement.photo_not_found"));
  return deps.images.read(userId, name, wanted.value);
}
