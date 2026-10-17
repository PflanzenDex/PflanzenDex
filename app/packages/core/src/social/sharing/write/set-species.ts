import { defineOperation, idField, ok, shape } from "../../../kernel";
import type { Share } from "../types";
import { photosField, shareField, type SetDependencies } from "./set";

/**
 * Bulk action "Share all specimens of this species" (US-SOZ-04, P-03): applies one decision to every active specimen of
 * the keeper's own with this species, in one transaction (all or nothing). Archived specimens are left out: they are
 * missing from every evaluation (US-BES-07). The answer says how many specimens it touched, so a species the keeper
 * has no specimen of is visible as 0 instead of a silent success (P-10). Withdrawing (`private`) works the same way.
 */
export const sharingSetSpecies = (deps: SetDependencies) =>
  defineOperation<
    { speciesId: string; share: Share; photos: boolean },
    { changed: number; share: Share }
  >({
    name: "sharing.set_species",
    schema: shape({
      speciesId: idField("speciesId"),
      share: shareField("share"),
      photos: photosField("photos"),
    }),
    run: async ({ userId }, input) => {
      const all = await deps.specimens.list(userId);
      const ids = all
        .filter((s) => s.speciesId === input.speciesId && s.status !== "archived")
        .map((s) => s.id);
      const shared = input.share === "friends";
      if (ids.length > 0) await deps.sharing.setMany(userId, ids, shared, shared && input.photos);
      return ok({ changed: ids.length, share: input.share });
    },
  });
