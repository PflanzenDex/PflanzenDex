import {
  effectiveDormancy,
  localToday,
  type AchievementFacts,
  type CareProfileReader,
  type MeasurementRow,
  type MeasurementStore,
  type SpeciesSource,
  type SpecimenStore,
  type SwapSide,
  type TreatmentRow,
  type TreatmentStore,
  type YearMeasurement,
} from "@pflanzendex/core";

/** The ports the facts are read through: the own data of the account only (P-04), through the modules' public ports. */
export interface FactSources {
  readonly specimens: Pick<SpecimenStore, "list">;
  readonly species: SpeciesSource;
  readonly profiles: CareProfileReader;
  readonly treatments: Pick<TreatmentStore, "open" | "doneMany">;
  readonly measurements: Pick<MeasurementStore, "listMany">;
  readonly swaps: { list(userId: string): Promise<readonly SwapSide[]> };
}

/**
 * The facts and the names of the specimens, for the links of the overview. `measurements` are the rows behind
 * `facts.measurements` with id and value: the year in review reads them from here (no second read).
 */
export interface FactsRead {
  readonly facts: AchievementFacts;
  readonly names: ReadonlyMap<string, string>;
  readonly measurements: readonly YearMeasurement[];
}

/** A course is the set of treatments sharing a course id; a single treatment without course is no course (assumption). */
function courseFacts(
  perSpecimen: readonly { id: string; done: readonly TreatmentRow[] }[],
  open: ReadonlyMap<string, readonly TreatmentRow[]>,
): AchievementFacts["treatmentCourses"] {
  const courses = new Map<string, { specimenId: string; rows: TreatmentRow[] }>();
  for (const p of perSpecimen) {
    for (const t of [...p.done, ...(open.get(p.id) ?? [])]) {
      if (t.courseId === null) continue;
      const course = courses.get(t.courseId) ?? { specimenId: p.id, rows: [] };
      course.rows.push(t);
      courses.set(t.courseId, course);
    }
  }
  return [...courses.values()].map((c) => ({
    specimenId: c.specimenId,
    dates: c.rows.map((t) => ({ doneOn: t.done ? t.doneAt : null })),
  }));
}

/** The measurement rows of the specimens: the specimens in the order of `ids`, each one's measurements in the order of `list`. */
function measurementRows(
  ids: readonly string[],
  measured: ReadonlyMap<string, readonly MeasurementRow[]>,
): YearMeasurement[] {
  return ids.flatMap((id) =>
    (measured.get(id) ?? []).map((m) => ({
      id: m.id,
      specimenId: id,
      date: m.date,
      value: m.value,
      quality: m.quality,
      photo: m.photo,
    })),
  );
}

/**
 * Reads the keeper's own data into the plain facts of the achievements (US-ACH-01, FR-ACH-02): nothing is stored.
 * Archived specimens stay in (the event history is kept, P-10). A course is the set of treatments sharing a course id;
 * a single treatment without course is no course (assumption, decided by the PO). The handover instant becomes the
 * local date in the keeper's time zone (NFR-08). Measurements and treatments are read once for all specimens (NFR-12),
 * in the order of the per-specimen reads: collections are small (starting value, assumption).
 */
export async function readAchievementFacts(
  src: FactSources,
  userId: string,
  timeZone: string,
): Promise<FactsRead> {
  const rows = await src.specimens.list(userId);
  const ids = rows.map((r) => r.id);
  const own = new Map((await src.profiles.list(userId)).map((p) => [p.speciesId, p] as const));
  const speciesIds = [...new Set(rows.map((r) => r.speciesId))];
  const found = await src.species.findMany(userId, speciesIds);
  const species = new Map(speciesIds.map((id, i) => [id, found[i] ?? null] as const));
  const [open, done, measured] = await Promise.all([
    src.treatments.open(userId, ids),
    src.treatments.doneMany(userId, ids),
    src.measurements.listMany(userId, ids),
  ]);
  const perSpecimen = ids.map((id) => ({ id, done: done.get(id) ?? [] }));
  const treatmentCourses = courseFacts(perSpecimen, open);
  const measurements = measurementRows(ids, measured);
  const facts: AchievementFacts = {
    specimens: rows.map((r) => {
      const spec = species.get(r.speciesId);
      const period = spec ? effectiveDormancy(spec, own.get(r.speciesId) ?? null) : null;
      return {
        id: r.id,
        name: r.name,
        caughtOn: r.caughtAt,
        archivedOn: r.archivedAt,
        cuttingRootedOn: r.repottedAt ?? null,
        dormancy: period ? { from: period.from, until: period.until } : null,
      };
    }),
    measurements: measurements.map(({ specimenId, date, quality, photo }) => ({
      specimenId,
      date,
      quality,
      hasPhoto: photo !== null,
    })),
    treatmentCourses,
    handovers: (await src.swaps.list(userId))
      .filter((s) => s.status === "handed_over" && s.handedOverAt !== null)
      .map((s) => ({
        date: localToday(new Date(s.handedOverAt as string), timeZone),
        specimenId: s.role === "giver" ? s.givenSpecimenId : s.receivedSpecimenId,
      })),
  };
  return {
    facts,
    names: new Map(rows.map((r) => [r.id, r.name] as const)),
    measurements,
  };
}
