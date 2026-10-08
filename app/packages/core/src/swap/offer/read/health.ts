import type { OfferDependencies, OfferHealth } from "../types";

/** Treatment facts of one specimen for an offer: open now, and the last done one (reason and date only, US-SOZ-08). */
export async function offerHealth(
  deps: Pick<OfferDependencies, "treatments">,
  userId: string,
  specimenId: string,
): Promise<OfferHealth> {
  const open = (await deps.treatments.open(userId, [specimenId])).get(specimenId) ?? [];
  const [last] = await deps.treatments.done(userId, specimenId);
  return {
    treatmentOpen: open.length > 0,
    lastTreated: last && last.doneAt !== null ? { reason: last.reason, doneAt: last.doneAt } : null,
  };
}
