import {
  appError,
  defineOperation,
  failed,
  idField,
  ok,
  shape,
  type ErrorDetail,
} from "../../../kernel";
import { SHARE, type Share, type SharingStore, type SpecimenLookup } from "../types";

export interface SetDependencies {
  readonly sharing: SharingStore;
  readonly specimens: SpecimenLookup;
}

export const shareField = (field: string) => (value: unknown) =>
  (SHARE as readonly unknown[]).includes(value)
    ? (value as Share)
    : ({ field, code: "input.invalid" } as ErrorDetail);

/** `photos` is optional and means off when left out (`Share_Photos` default off). */
export const photosField = (field: string) => (value: unknown) =>
  value === undefined || value === null
    ? false
    : typeof value === "boolean"
      ? value
      : ({ field, code: "input.invalid" } as ErrorDetail);

/**
 * Decides what friends see of one specimen (US-SOZ-04, P-03): `friends` shares it, `private` (the default for every
 * specimen) withdraws it again, and `photos` switches `Share_Photos`. Takes effect for the next retrieval of every friend;
 * what was already delivered cannot be retrieved. Only the keeper's own, not archived specimen can be shared; a foreign or
 * unknown one is `specimen.not_found` (P-04). Withdrawing works for archived specimens as well. Repeating a call
 * changes nothing. Own data is never deleted; the global switch "Everything private" suspends the rows without touching them.
 */
export const sharingSet = (deps: SetDependencies) =>
  defineOperation<
    { specimenId: string; share: Share; photos: boolean },
    { share: Share; photos: boolean }
  >({
    name: "sharing.set",
    schema: shape({
      specimenId: idField("specimenId"),
      share: shareField("share"),
      photos: photosField("photos"),
    }),
    run: async ({ userId }, input) => {
      const specimen = await deps.specimens.find(userId, input.specimenId);
      if (!specimen) return failed(appError("specimen.not_found"));
      if (input.share === "friends" && specimen.status === "archived")
        return failed(appError("specimen.archived"));
      const shared = input.share === "friends";
      await deps.sharing.set(userId, specimen.id, shared, shared && input.photos);
      return ok({ share: input.share, photos: shared && input.photos });
    },
  });
