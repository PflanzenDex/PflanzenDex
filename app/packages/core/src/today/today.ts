// The central `status` function (TE-07, R-04): "Today", the reminders (MON) and the AI daily status (KI-02) all derive
// what needs action from here, so that they cannot disagree. It reuses the derivations of the other modules (open
// treatments, care phases, hints about incomplete specimens) and adds only the order and the next action. Read only,
// nothing is stored (P-01).
import { appError, failed, isTimeZone, localToday, ok, type Result } from "../kernel";
import { specimenHints, type HintsDependencies } from "../collection";
import {
  carePhasesList,
  phaseStatus,
  treatmentOpenList,
  type PhasesDependencies,
  type PhasesRow,
  type TreatmentListDependencies,
  type TreatmentListRow,
} from "../care";
import type { TodayItem, TodayList } from "./today-types";

export type TodayDependencies = TreatmentListDependencies & PhasesDependencies & HintsDependencies;

const PHASE_NAME = { growth: "Wachstumsphase", dormancy: "Ruhephase" } as const;

const treatmentItem = (t: TreatmentListRow): TodayItem => ({
  id: `treatment:${t.id}`,
  kind: t.status.kind === "overdue" ? "treatment_overdue" : "treatment_due",
  specimenId: t.specimenId,
  specimenName: t.specimenName,
  text: `„${t.specimenName}“: ${t.reason} – ${t.status.text}.`,
  nextAction: "Behandle das Exemplar und hake den Termin als erledigt ab.",
  target: "treatments",
});

const deviationItem = (p: PhasesRow): TodayItem => ({
  id: `phase:${p.specimenId}`,
  kind: "phase_deviation",
  specimenId: p.specimenId,
  specimenName: p.name,
  text: `„${p.name}“ steht nicht am Soll-Standort der ${PHASE_NAME[p.phase]}.`,
  nextAction: "Stelle das Exemplar um und bestätige es unter Pflegephasen mit „Jetzt umgestellt“.",
  target: "care_phases",
});

const byName = (a: TodayItem, b: TodayItem) =>
  a.specimenName.localeCompare(b.specimenName, "de") || a.id.localeCompare(b.id);

/** Overdue and due today, in the order of `treatmentOpenList`: the earliest date, so the most overdue, first. */
const treatmentOrder = (rows: readonly TreatmentListRow[]) =>
  rows.filter((t) => t.status.kind === "overdue" || t.status.kind === "today").map(treatmentItem);

/**
 * What needs action today (TE-07): treatments overdue or due today, specimens away from the target location of their
 * phase (US-PHA-02) and incomplete specimens (US-BES-08), in this order of urgency: what is bound to a date first.
 * A specimen without location is reported once, as incomplete data, not again as a phase deviation (P-10 without
 * duplicates). `today` is the date in `timeZone`, taken from one reading of the clock for all parts (NFR-08).
 */
export async function todayStatus(
  deps: TodayDependencies,
  userId: string,
  timeZone: unknown,
): Promise<Result<TodayList>> {
  if (!isTimeZone(timeZone))
    return failed(
      appError("input.invalid", { details: [{ field: "timeZone", code: "input.invalid" }] }),
    );
  const now = deps.clock();
  const same = { ...deps, clock: () => now };
  const [treatments, phases, hints] = await Promise.all([
    treatmentOpenList(same, userId, timeZone),
    carePhasesList(same, userId, timeZone),
    specimenHints(same, userId),
  ]);
  if (!treatments.ok) return treatments;
  if (!phases.ok) return phases;
  const due = treatmentOrder(treatments.value);
  const deviations = phases.value.filter((p) => phaseStatus(p) === "deviation").map(deviationItem);
  const incomplete = hints.map((h): TodayItem => ({
    id: `hint:${h.specimenId}:${h.kind}`,
    kind: "specimen_incomplete",
    specimenId: h.specimenId,
    specimenName: h.specimenName,
    text: h.text,
    nextAction: h.nextAction,
    target: "hints",
  }));
  return ok({
    date: localToday(now, timeZone),
    items: [...due, ...deviations.sort(byName), ...incomplete.sort(byName)],
    upcoming: treatments.value.length - due.length,
  });
}
