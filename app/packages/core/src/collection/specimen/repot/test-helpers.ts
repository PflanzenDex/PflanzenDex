import type { SpecimenRow } from "../../shared/types";
import {
  REPOT_SIGNS,
  type OpenSign,
  type RepotSign,
  type RepotStore,
  type SignRefusal,
} from "./types";

/** What the repot log needs from the specimens beside it (the real adapter keeps both in one transaction). */
export interface RepotHost {
  find(userId: string, id: string): Promise<SpecimenRow | null>;
  update(userId: string, id: string, change: Partial<SpecimenRow>): SpecimenRow;
  count(): void;
}

interface SignRow {
  readonly userId: string;
  readonly specimenId: string;
  readonly sign: RepotSign;
  readonly tickedOn: string;
  clearedOn: string | null;
}

/** In-memory repot history and observations for tests (US-BES-19); the real adapter is `RepotPostgres` in `db`. */
export class InMemoryRepotLog implements RepotStore {
  /** One entry per repot with a day (DM-BES-09). */
  readonly repots: { userId: string; specimenId: string; repottedOn: string }[] = [];
  /** Every observation ticked; a clearing sets `clearedOn`, nothing is deleted (P-10). */
  readonly signs: SignRow[] = [];

  constructor(private readonly host: RepotHost) {}

  /** The repot of `SpecimenStore.repot`, with the answers of the real adapter. */
  async repot(
    userId: string,
    id: string,
    date: string | null,
    chosenDate: string | null,
  ): Promise<SpecimenRow | "not_found" | "archived" | "before_caught" | "day_unknown"> {
    const z = await this.host.find(userId, id);
    if (!z) return "not_found";
    if (z.status === "archived") return "archived";
    if (chosenDate !== null && z.caughtAt !== null && z.caughtAt > chosenDate)
      return "before_caught";
    if (z.status === "plant" && date === null) return "day_unknown";
    if (date !== null) this.recordRepot(userId, id, date);
    const change = z.status === "cutting" ? { status: "plant" as const, repottedAt: date } : {};
    return this.host.update(userId, id, change);
  }

  private recordRepot(userId: string, id: string, date: string) {
    this.repots.push({ userId, specimenId: id, repottedOn: date });
    for (const s of this.signs)
      if (s.userId === userId && s.specimenId === id && s.clearedOn === null)
        s.clearedOn = s.tickedOn > date ? s.tickedOn : date;
  }

  async lastRepotted(userId: string, specimenIds: readonly string[]) {
    const latest = new Map<string, string>();
    for (const r of this.repots)
      if (r.userId === userId && specimenIds.includes(r.specimenId)) {
        const known = latest.get(r.specimenId);
        if (known === undefined || r.repottedOn > known) latest.set(r.specimenId, r.repottedOn);
      }
    return latest;
  }

  private open(userId: string, specimenId: string, sign: RepotSign) {
    return this.signs.find(
      (s) =>
        s.userId === userId &&
        s.specimenId === specimenId &&
        s.sign === sign &&
        s.clearedOn === null,
    );
  }

  private openOf(userId: string, specimenId: string): OpenSign[] {
    return REPOT_SIGNS.flatMap((sign) => {
      const open = this.open(userId, specimenId, sign);
      return open ? [{ sign, tickedOn: open.tickedOn }] : [];
    });
  }

  /** The refusal for a specimen that is not an active plant; `null` when it is one. */
  private async refusal(userId: string, id: string): Promise<SignRefusal | null> {
    const z = await this.host.find(userId, id);
    if (!z) return "not_found";
    if (z.status === "archived") return "archived";
    return z.status === "plant" ? null : "not_a_plant";
  }

  async openSigns(userId: string, specimenId: string) {
    const refused = await this.refusal(userId, specimenId);
    return refused ?? this.openOf(userId, specimenId);
  }

  async tickSign(userId: string, specimenId: string, sign: RepotSign, day: string) {
    const refused = await this.refusal(userId, specimenId);
    if (refused) return refused;
    if (!this.open(userId, specimenId, sign)) {
      this.host.count();
      this.signs.push({ userId, specimenId, sign, tickedOn: day, clearedOn: null });
    }
    return this.openOf(userId, specimenId);
  }

  async untickSign(userId: string, specimenId: string, sign: RepotSign, day: string) {
    const refused = await this.refusal(userId, specimenId);
    if (refused) return refused;
    const open = this.open(userId, specimenId, sign);
    if (open) {
      this.host.count();
      open.clearedOn = open.tickedOn > day ? open.tickedOn : day;
    }
    return this.openOf(userId, specimenId);
  }
}
