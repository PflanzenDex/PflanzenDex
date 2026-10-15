// Criteria of the group "care" (US-ACH-01). Pure functions over the keeper's own facts (FR-ACH-01).
import type { Criterion, Earned, SpecimenFact } from "../types";

const earliest = (events: readonly Earned[]): Earned | null =>
  events.reduce<Earned | null>((a, e) => (a === null || e.earnedOn < a.earnedOn ? e : a), null);

/** Treatment completed: every date of a course ticked off; earned on the day the last one was ticked (US-BEH-03). */
export const treatmentCompleted: Criterion = (facts) => {
  const done: Earned[] = [];
  let next: { specimenId: string; open: number } | null = null;
  for (const c of facts.treatmentCourses) {
    if (c.dates.length === 0) continue;
    const open = c.dates.filter((d) => d.doneOn === null).length;
    if (open === 0) {
      const last = c.dates.map((d) => d.doneOn ?? "").reduce((a, b) => (b > a ? b : a), "");
      done.push({ earnedOn: last, specimenId: c.specimenId });
    } else if (next === null || open < next.open) next = { specimenId: c.specimenId, open };
  }
  const first = earliest(done);
  if (first) return { earned: first };
  return {
    open: { missing: next ? null : "no_treatment", specimenId: next?.specimenId ?? null },
  };
};

/** Cutting rooted: a cutting became its own plant; earned on the repot date, never on the date the app noticed. */
export const cuttingRooted: Criterion = (facts) => {
  const first = earliest(
    facts.specimens.flatMap((s) =>
      s.cuttingRootedOn ? [{ earnedOn: s.cuttingRootedOn, specimenId: s.id }] : [],
    ),
  );
  return first ? { earned: first } : { open: { missing: null, specimenId: null } };
};

/** First full dormancy period of the specimen that began after it was caught and ended while it was still with me. */
function lastedDormancy(s: SpecimenFact, today: string): string | null {
  if (!s.caughtOn || !s.dormancy) return null;
  const limit = s.archivedOn && s.archivedOn < today ? s.archivedOn : today;
  const { from, until } = s.dormancy;
  const wraps = from > until;
  for (let y = Number(s.caughtOn.slice(0, 4)); y <= Number(limit.slice(0, 4)); y++) {
    const start = `${y}-${from}`;
    const end = `${wraps ? y + 1 : y}-${until}`;
    if (start >= s.caughtOn && end <= limit) return end;
  }
  return null;
}

/** Through a dormancy phase: lived through one full dormancy period with me (US-PHA-01); earned on its last day. */
export const throughDormancy: Criterion = (facts, today) => {
  const first = earliest(
    facts.specimens.flatMap((s) => {
      const end = lastedDormancy(s, today);
      return end ? [{ earnedOn: end, specimenId: s.id }] : [];
    }),
  );
  if (first) return { earned: first };
  if (!facts.specimens.some((s) => s.caughtOn)) {
    return { open: { missing: "no_catch_date", specimenId: null } };
  }
  if (!facts.specimens.some((s) => s.dormancy)) {
    return { open: { missing: "no_dormancy_period", specimenId: null } };
  }
  return { open: { missing: null, specimenId: null } };
};
