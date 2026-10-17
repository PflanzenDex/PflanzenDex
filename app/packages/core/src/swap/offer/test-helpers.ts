import type {
  OfferRow,
  OfferStatus,
  OfferStore,
  OfferValues,
  OwnSpecimen,
  OwnSpecimens,
  PhaseHints,
} from "./types";

/** In-memory adapters for tests only; the real ones live in `db` and the app root. */
export class InMemoryOffers implements OfferStore {
  readonly rows: (Omit<OfferRow, "status"> & { userId: string; status: OfferStatus })[] = [];
  writes = 0;

  async create(userId: string, v: OfferValues): Promise<OfferRow | "already_open"> {
    if (
      this.rows.some(
        (r) =>
          r.userId === userId &&
          r.specimenId === v.specimenId &&
          (r.status === "open" || r.status === "reserved"),
      )
    )
      return "already_open";
    this.writes += 1;
    const row = {
      ...v,
      id: `00000000-0000-4000-8000-${String(this.rows.length + 1).padStart(12, "0")}`,
      status: "open" as const,
      createdAt: "2026-10-08T10:00:00.000Z",
    };
    this.rows.push({ ...row, userId });
    return row;
  }

  async find(userId: string, id: string): Promise<OfferRow | null> {
    return this.of(userId).find((r) => r.id === id) ?? null;
  }

  async list(userId: string): Promise<readonly OfferRow[]> {
    return this.of(userId).reverse();
  }

  async withdraw(userId: string, id: string): Promise<OfferRow | "not_found" | "not_active"> {
    const row = this.rows.find((r) => r.userId === userId && r.id === id);
    if (!row) return "not_found";
    if (row.status === "withdrawn") return { ...row };
    if (row.status === "handed_over") return "not_active";
    this.writes += 1;
    row.status = "withdrawn";
    return { ...row };
  }

  private of(userId: string): OfferRow[] {
    return this.rows
      .filter((r) => r.userId === userId)
      .map((r) => ({
        id: r.id,
        specimenId: r.specimenId,
        type: r.type,
        mode: r.mode,
        wish: r.wish,
        note: r.note,
        status: r.status,
        createdAt: r.createdAt,
      }));
  }
}

export class InMemoryOwnSpecimens implements OwnSpecimens {
  constructor(private readonly byOwner: Readonly<Record<string, readonly OwnSpecimen[]>>) {}
  async find(userId: string, id: string) {
    return this.byOwner[userId]?.find((s) => s.id === id) ?? null;
  }
}

export class StubPhases implements PhaseHints {
  constructor(
    private readonly table: Readonly<Record<string, "growth" | "dormancy" | null>> = {},
  ) {}
  async phaseOf(_userId: string, specimenId: string) {
    return this.table[specimenId] ?? null;
  }
}
