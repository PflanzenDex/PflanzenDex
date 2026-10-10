import {
  carePhasesList,
  isActive,
  localToday,
  measurementOverdue,
  phaseChangeOccasions,
  todayStatus,
  type Occasion,
  type OccasionSource,
} from "@pflanzendex/core";
import { ProfilePostgres, RemindersPostgres } from "@pflanzendex/db";
import type { Pool } from "pg";
import { todayDependencies, type TodayOptions } from "./today-routes";

/**
 * The occasions of the reminders (US-MON-01, FR-MON-03): derived from the same status function as the "Today" list, so
 * the two cannot disagree. Treatments due or overdue (US-MON-03) come from it; the overdue measurement (US-MON-04) is
 * derived from the last measurement of each active plant (a cutting is left out until E-11 is decided). An occasion that
 * the keeper switched off in the profile (US-ACC-02) is not reported; a pause is applied later, when the bundle is built.
 * The phase change (US-MON-02) comes from the phase list, the same rows and the same deviation rule as the Today list
 * (`phaseChangeOccasions`). Not built yet: watering (US-MON-05).
 */
export function reminderOccasionsFor(pool: Pool, opt: TodayOptions): OccasionSource {
  const profiles = new ProfilePostgres(pool);
  const reminders = new RemindersPostgres(pool);
  return {
    async occasions(userId, timeZone, now) {
      const deps = { ...todayDependencies(pool, opt), clock: () => now };
      const today = await todayStatus(deps, userId, timeZone);
      if (!today.ok) throw new Error(today.error.code);
      const treatments = today.value.items
        .filter((i) => i.kind === "treatment_due" || i.kind === "treatment_overdue")
        .map((i): Occasion => ({
          id: i.id,
          occasion: "treatment",
          text: i.text,
          nextAction: i.nextAction,
        }));
      const phases = await carePhasesList(deps, userId, timeZone);
      if (!phases.ok) throw new Error(phases.error.code);
      const [rows, settings, profile] = await Promise.all([
        deps.specimens.list(userId),
        reminders.settings(userId),
        profiles.find(userId),
      ]);
      const plants = rows.filter((r) => isActive(r) && r.status === "plant");
      const last = await deps.measurements.forSpecimens(
        userId,
        plants.map((r) => r.id),
      );
      const measurements = measurementOverdue(
        plants.map((r) => ({
          id: r.id,
          name: r.name,
          lastMeasuredOn: last.get(r.id)?.last.date ?? null,
          since: r.caughtAt,
        })),
        localToday(now, timeZone),
        settings.measurementDays,
      );
      const off = (o: Occasion) => profile?.notifications[o.occasion] === false;
      return [...treatments, ...phaseChangeOccasions(phases.value), ...measurements].filter(
        (o) => !off(o),
      );
    },
  };
}
