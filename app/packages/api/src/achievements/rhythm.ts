import {
  careRhythm,
  effectiveDormancy,
  restPauses,
  type CareProfileReader,
  type RhythmPauseStore,
  type SpeciesSource,
  localToday,
  type MeasurementStore,
  type RhythmTask,
  type SpecimenStore,
  type TreatmentStore,
} from "@pflanzendex/core";

/** The ports of the care rhythm: the own specimens, treatments and measurements only (P-04). */
export interface RhythmSources {
  readonly specimens: Pick<SpecimenStore, "list">;
  readonly treatments: Pick<TreatmentStore, "open" | "done">;
  readonly measurements: Pick<MeasurementStore, "list">;
  readonly pauses: Pick<RhythmPauseStore, "listPauses">;
  readonly species: SpeciesSource;
  readonly profiles: CareProfileReader;
  readonly reminders: { settings(userId: string): Promise<{ measurementDays: number }> };
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]
    .map((n, i) => String(n).padStart(i === 0 ? 4 : 2, "0"))
    .join("-");
}

/** The dormancy period of every active plant (`null` = none known, so the plant never rests, P-08). */
async function dormancyPeriods(
  src: Pick<RhythmSources, "species" | "profiles">,
  userId: string,
  rows: readonly { speciesId: string; status: string; archivedAt: string | null }[],
) {
  const plants = rows.filter((r) => r.status === "plant" && r.archivedAt === null);
  const own = new Map((await src.profiles.list(userId)).map((p) => [p.speciesId, p] as const));
  const ids = [...new Set(plants.map((r) => r.speciesId))];
  const found = await src.species.findMany(userId, ids);
  const byId = new Map(ids.map((id, i) => [id, found[i] ?? null] as const));
  return plants.map((r) => {
    const species = byId.get(r.speciesId);
    return species ? effectiveDormancy(species, own.get(r.speciesId) ?? null) : null;
  });
}

/**
 * The care rhythm (US-ACH-04), derived on every request from the own data (FR-ACH-02). Tasks exist because of the
 * plants' needs: every treatment date (open or done, US-BEH-02/03) and every measurement interval of a plant (US-MON-04:
 * the next measurement is due `measurementDays` after the last one, or after the catch date; a cutting has the same
 * interval as for the reminders, E-11). A measurement made earlier than due counts the same (FR-ACH-05). The tasks of an archived
 * specimen that were still open when it was archived are dropped: the archive ends the need (P-10 keeps the history).
 * Weeks are neutral inside the explicit pauses of the keeper (up to 4 weeks) and on the days on which every active plant
 * is in its dormancy (current specimens and dormancy periods applied to the past: assumption). Interval watering
 * (US-MON-05) is not part: the watering log keeps no history of the interval in force, so a past due date could only be
 * invented (P-08; decided by the PO).
 */
export async function achievementsRhythm(
  src: RhythmSources,
  userId: string,
  timeZone: string,
  now: Date,
) {
  const rows = await src.specimens.list(userId);
  const ids = rows.map((r) => r.id);
  const open = await src.treatments.open(userId, ids);
  const { measurementDays } = await src.reminders.settings(userId);
  const tasks: RhythmTask[] = [];
  for (const r of rows) {
    const archived = r.archivedAt;
    const keep = (t: RhythmTask) => archived === null || t.doneOn !== null || t.dueOn < archived;
    const treatments = [...(open.get(r.id) ?? []), ...(await src.treatments.done(userId, r.id))];
    tasks.push(
      ...treatments.map((t) => ({ dueOn: t.dueAt, doneOn: t.done ? t.doneAt : null })).filter(keep),
    );
    if (r.status === "archived") continue;
    const dates = (await src.measurements.list(userId, r.id)).map((m) => m.date).sort();
    const starts = [...(r.caughtAt ? [r.caughtAt] : []), ...dates];
    // Each start (the catch date, then every measurement) opens a task that the next measurement closes.
    const shift = r.caughtAt ? 0 : 1;
    starts.forEach((from, i) => {
      const doneOn = dates[i + shift] ?? null;
      const t = { dueOn: addDays(from, measurementDays), doneOn };
      if (keep(t)) tasks.push(t);
    });
  }
  const today = localToday(now, timeZone);
  const stored = await src.pauses.listPauses(userId);
  const first = tasks.map((t) => t.dueOn).sort()[0] ?? today;
  const rest = restPauses(await dormancyPeriods(src, userId, rows), first, today);
  return {
    calmMode: false as const,
    ...careRhythm(tasks, today, [...stored, ...rest]),
    pauses: stored,
  };
}
