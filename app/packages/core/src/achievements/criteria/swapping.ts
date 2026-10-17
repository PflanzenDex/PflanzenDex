// Criteria of the group "swapping" (US-ACH-01).
import type { Criterion } from "../types";

/** First handover: a swap confirmed by both sides (US-SOZ-11); earned on the local handover date. */
export const firstHandover: Criterion = (facts) => {
  const first = facts.handovers.reduce<(typeof facts.handovers)[number] | null>(
    (a, h) => (a === null || h.date < a.date ? h : a),
    null,
  );
  return first
    ? { earned: { earnedOn: first.date, specimenId: first.specimenId } }
    : { open: { missing: null, specimenId: null } };
};
