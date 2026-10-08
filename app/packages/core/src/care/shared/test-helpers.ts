import type { SpeciesSource, SpecimenStore, SpecimenRow } from "../../collection";
import type { Species, GrowthMeasure } from "../../catalog";
import type { MeasurementStore, MeasurementValues, MeasurementRow } from "../measurements/types";
import { appError, failed, ok } from "../../kernel";
import type { ErrorCode, Result } from "../../kernel";
import type { PhotoStorage } from "../measurements/capture/photo";
import type { CarePhase } from "../phases/phase";
import type { PhaseLocationSource } from "../phases/phase-location";

/**
 * Locations per account, species and phase for tests only (the real source is the care profile, US-BES-09).
 * `calls` shows which phases were asked, so tests can check that the phase comes from the local date.
 */
export class PhaseLocationStub implements PhaseLocationSource {
  readonly calls: { userId: string; speciesId: string; phase: CarePhase }[] = [];

  constructor(
    private readonly table: Readonly<
      Record<string, Partial<Record<string, Partial<Record<CarePhase, string>>>>>
    >,
  ) {}

  async phaseLocation(userId: string, speciesId: string, phase: CarePhase) {
    this.calls.push({ userId, speciesId, phase });
    return this.table[userId]?.[speciesId]?.[phase] ?? null;
  }
}

/** Specimens per account (tests of `care` only, no product code); each has the species `species-1`. */
export class SpecimenStub implements Pick<SpecimenStore, "find"> {
  /** `archived` names the IDs that are archived (US-BES-07). */
  constructor(
    private readonly ownership: Readonly<Record<string, readonly string[]>>,
    private readonly archived: readonly string[] = [],
    /** IDs that are cuttings (US-BES-04). */
    private readonly cuttings: readonly string[] = [],
  ) {}

  async find(userId: string, id: string): Promise<SpecimenRow | null> {
    if (!this.ownership[userId]?.includes(id)) return null;
    const away = this.archived.includes(id);
    return {
      id,
      speciesId: "species-1",
      name: "Bogenhanf",
      marker: null,
      locationId: null,
      status: away ? "archived" : this.cuttings.includes(id) ? "cutting" : "plant",
      caughtAt: "2026-10-01",
      createdAt: "2026-10-01T10:00:00Z",
      archivedAt: away ? "2026-10-02" : null,
      archivedReason: away ? "eingegangen" : null,
    };
  }
}

/** A single species with the desired growth measure and etiolation signs; `null` means "species not visible". */
export const speciesStub = (
  growthMeasure: GrowthMeasure | null,
  etiolationSigns = "Triebe werden lang und dünn.",
): SpeciesSource => ({
  find: async () =>
    growthMeasure ? ({ id: "species-1", growthMeasure, etiolationSigns } as Species) : null,
});

/** In-memory adapter for tests only; the real adapter lives in `db`. */
export class InMemoryMeasurements implements MeasurementStore {
  readonly rows: (MeasurementRow & { userId: string })[] = [];
  writes = 0;

  constructor(private readonly ownership: Readonly<Record<string, readonly string[]>>) {}

  async list(userId: string, specimenId: string): Promise<readonly MeasurementRow[]> {
    return this.rows
      .map((z, i) => ({ z, i }))
      .filter(({ z }) => z.userId === userId && z.specimenId === specimenId)
      .sort((a, b) => b.z.date.localeCompare(a.z.date) || b.i - a.i)
      .map(({ z: { userId: owner, ...row } }) => {
        void owner;
        return row;
      });
  }

  async lastFor(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, MeasurementRow>> {
    const last = new Map<string, MeasurementRow>();
    for (const id of specimenIds) {
      const [newest] = await this.list(userId, id);
      if (newest) last.set(id, newest);
    }
    return last;
  }

  async lastPhotoFor(userId: string, specimenIds: readonly string[]) {
    const found = new Map<string, { id: string; date: string }>();
    for (const id of specimenIds) {
      const [newest] = (await this.list(userId, id)).filter((z) => z.photo);
      if (newest) found.set(id, { id: newest.id, date: newest.date });
    }
    return found;
  }

  async findOnDate(userId: string, specimenId: string, date: string) {
    const [newest] = (await this.list(userId, specimenId)).filter((z) => z.date === date);
    return newest ?? null;
  }

  async setPhoto(userId: string, measurementId: string, photo: string): Promise<boolean> {
    const row = this.rows.find((z) => z.userId === userId && z.id === measurementId);
    if (!row) return false;
    this.rows[this.rows.indexOf(row)] = { ...row, photo };
    return true;
  }

  async create(userId: string, w: MeasurementValues): Promise<MeasurementRow | "specimen_unknown"> {
    this.writes += 1;
    if (!this.ownership[userId]?.includes(w.specimenId)) return "specimen_unknown";
    const row: MeasurementRow = { ...w, id: `m${this.rows.length + 1}`, photo: null };
    this.rows.push({ ...row, userId });
    return row;
  }
}

/** In-memory `PhotoStorage` for tests only; the real one is `imageStorage` of `media`, composed in the API. */
export class PhotoStorageStub implements PhotoStorage {
  readonly objects = new Set<string>();
  calls = 0;

  /** The refusal the next uploads get (like `media.not_an_image` from the real pipeline); `null` accepts. */
  refusal: ErrorCode | null = null;

  async put(accountId: string, name: string): Promise<Result<{ width: number; height: number }>> {
    this.calls += 1;
    if (this.refusal) return failed(appError(this.refusal));
    this.objects.add(`${accountId}/${name}`);
    return ok({ width: 800, height: 600 });
  }

  async remove(accountId: string, name: string): Promise<Result<void>> {
    this.objects.delete(`${accountId}/${name}`);
    return ok(undefined);
  }
}
