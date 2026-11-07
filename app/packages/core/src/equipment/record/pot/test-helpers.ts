import type {
  PlacementResult,
  PlaceRefusal,
  PotPlacementStore,
  PotRecord,
  PotRepotSteps,
  PotRepotUnit,
} from "./types";

/** The pot records the placement needs, as the in-memory equipment store keeps them. */
interface PotRow {
  readonly userId: string;
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly status: string | null;
  readonly diameterCm: number | null;
}

/** The plant side: only the status of a plant, looked up by the same account (P-04). */
export interface PlantStatus {
  find(userId: string, id: string): Promise<{ readonly status: string } | null>;
}

interface Placement {
  readonly userId: string;
  readonly specimenId: string;
  readonly potId: string;
  readonly placedOn: string;
  leftOn: string | null;
}

/** In-memory placements for tests (US-BES-19); the real adapter is `PotPlacementPostgres` in `db`. */
export class InMemoryPotPlacements implements PotPlacementStore {
  readonly placements: Placement[] = [];
  writes = 0;

  constructor(
    private readonly pots: { readonly rows: readonly PotRow[] },
    private readonly plants: PlantStatus,
  ) {}

  private pot(userId: string, potId: string): PotRow | undefined {
    return this.pots.rows.find(
      (p) => p.userId === userId && p.id === potId && p.type === "Pot" && p.status === "active",
    );
  }

  /** Whether an open placement of the pot belongs to a plant that is not archived (a taken pot). */
  private async heldByActivePlant(userId: string, potId: string, except: string): Promise<boolean> {
    for (const p of this.placements) {
      if (p.userId !== userId || p.potId !== potId || p.leftOn !== null || p.specimenId === except)
        continue;
      const plant = await this.plants.find(userId, p.specimenId);
      if (plant && plant.status !== "archived") return true;
    }
    return false;
  }

  /** The pot must be an own active `Pot` and not held by a plant that is not archived (US-BES-19). */
  private async free(
    userId: string,
    potId: string,
    specimenId: string,
  ): Promise<PlaceRefusal | null> {
    if (!this.pot(userId, potId)) return "pot_not_found";
    return (await this.heldByActivePlant(userId, potId, specimenId)) ? "pot_taken" : null;
  }

  /** Closes an open placement on `day`, never before its start (the table's check). */
  private close(placement: Placement, day: string) {
    placement.leftOn = placement.placedOn > day ? placement.placedOn : day;
  }

  private openOf(userId: string, specimenId: string): Placement | undefined {
    return this.placements.find(
      (p) => p.userId === userId && p.specimenId === specimenId && p.leftOn === null,
    );
  }

  /** Closes every open placement into the pot, the stale ones of archived plants (the pot was free, US-BES-19). */
  private closeInto(userId: string, potId: string, day: string) {
    for (const p of this.placements)
      if (p.userId === userId && p.potId === potId && p.leftOn === null) this.close(p, day);
  }

  async place(
    userId: string,
    specimenId: string,
    potId: string | null,
    day: string,
  ): Promise<PlacementResult | PlaceRefusal> {
    const refused = potId === null ? null : await this.free(userId, potId, specimenId);
    if (refused) return refused;
    const open = this.openOf(userId, specimenId);
    if (open?.potId === potId) return { potId, placedOn: open.placedOn, changed: false };
    if (!open && potId === null) return { potId: null, placedOn: null, changed: false };
    this.writes += 1;
    if (open) this.close(open, day);
    if (potId === null) return { potId: null, placedOn: null, changed: true };
    this.closeInto(userId, potId, day);
    this.placements.push({ userId, specimenId, potId, placedOn: day, leftOn: null });
    return { potId, placedOn: day, changed: true };
  }

  async currentPot(userId: string, specimenId: string): Promise<PotRecord | null> {
    const open = this.placements.find(
      (p) => p.userId === userId && p.specimenId === specimenId && p.leftOn === null,
    );
    const pot = open ? this.pots.rows.find((p) => p.id === open.potId) : undefined;
    return pot ? { id: pot.id, name: pot.name, diameterCm: pot.diameterCm } : null;
  }

  async freePots(userId: string): Promise<readonly PotRecord[]> {
    const free: PotRecord[] = [];
    for (const p of this.pots.rows) {
      if (p.userId !== userId || p.type !== "Pot" || p.status !== "active") continue;
      if (await this.heldByActivePlant(userId, p.id, "")) continue;
      free.push({ id: p.id, name: p.name, diameterCm: p.diameterCm });
    }
    return free.sort((a, b) => a.name.localeCompare(b.name, "de"));
  }
}

/**
 * Runs the steps of a repot with a pot in memory: when the keeper's unit answers "do not commit", the state saved before
 * the work is put back, as the transaction of the database does (US-BES-19, one unit of work).
 */
export class InMemoryPotRepotUnit implements PotRepotUnit {
  constructor(
    private readonly steps: PotRepotSteps,
    private readonly save: () => () => void,
  ) {}

  async run<T>(
    _userId: string,
    work: (steps: PotRepotSteps) => Promise<{ readonly commit: boolean; readonly value: T }>,
  ): Promise<T> {
    const restore = this.save();
    const { commit, value } = await work(this.steps);
    if (!commit) restore();
    return value;
  }
}
