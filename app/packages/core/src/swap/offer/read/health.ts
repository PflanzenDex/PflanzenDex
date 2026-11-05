import type { OfferDependencies, OfferHealth } from "../types";

/** The health of a specimen without an entry in `healthOf`: nothing open and nothing treated. Every requested ID has one. */
export const NO_OFFER_HEALTH: OfferHealth = { treatmentOpen: false, lastTreated: null };

/**
 * Treatment facts of the named specimens for their offers (US-SOZ-08): "treatment open" and the last done treatment
 * (reason and date only). One read for any number of IDs (NFR-12); every requested ID has an entry. Never the agent and
 * never a note.
 */
export async function healthOf(
  deps: Pick<OfferDependencies, "treatments">,
  userId: string,
  specimenIds: readonly string[],
): Promise<ReadonlyMap<string, OfferHealth>> {
  const ids = [...new Set(specimenIds)];
  if (ids.length === 0) return new Map();
  const { open, lastDone } = await deps.treatments.openAndLastDone(userId, ids);
  return new Map(
    ids.map((id): readonly [string, OfferHealth] => {
      const latest = lastDone.get(id);
      return [
        id,
        {
          treatmentOpen: (open.get(id) ?? []).length > 0,
          lastTreated:
            latest && latest.doneAt !== null
              ? { reason: latest.reason, doneAt: latest.doneAt }
              : null,
        },
      ];
    }),
  );
}
