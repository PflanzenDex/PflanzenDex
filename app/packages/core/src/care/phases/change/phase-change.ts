import type { Occasion } from "../../../monitoring";
import type { CarePhase } from "../phase";
import type { PhasesRow } from "../phases";
import { phaseStatus } from "../phase-status";

const PHASE_NAME: Record<CarePhase, string> = {
  growth: "Wachstumsphase",
  dormancy: "Ruhephase",
};

/**
 * The reminders at the phase change (US-MON-02): a specimen whose phase begins today (the dormancy begins or ends) and
 * that still stands at the old location, i.e. the same deviation the phase list shows (`phaseStatus`, FR-MON-03: one
 * calculation, never a second one). Unknown locations or targets are no "old location" (P-08); a missing location has
 * its own warning (US-BES-08). The id carries the date, so the same change is the same occasion all day (FR-MON-02), and
 * after the day the reminder is gone while the Today list keeps showing the deviation (P-10).
 */
export function phaseChangeOccasions(rows: readonly PhasesRow[]): Occasion[] {
  return rows.flatMap((r): Occasion[] =>
    r.nextChange?.days === 0 && phaseStatus(r) === "deviation"
      ? [
          {
            id: `phase_change:${r.specimenId}:${r.nextChange.date}`,
            occasion: "phase",
            text: `„${r.name}“: heute beginnt die ${PHASE_NAME[r.nextChange.phase]}, das Exemplar steht noch am alten Standort.`,
            nextAction:
              "Stelle das Exemplar um und bestätige es unter Pflegephasen mit „Jetzt umgestellt“.",
          },
        ]
      : [],
  );
}
