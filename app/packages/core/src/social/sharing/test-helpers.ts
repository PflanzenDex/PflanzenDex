import type {
  PrivacySwitch,
  SharedFacts,
  SharedSpecimen,
  SharingRow,
  SharingStore,
  SpecimenFact,
  SpecimenLookup,
} from "./types";

/** In-memory adapters for tests only; the real ones live in `db` and the app root. */
export class InMemorySharing implements SharingStore {
  /** `owner:specimen` -> photos */
  readonly rows = new Map<string, boolean>();
  writes = 0;
  /** Pairs that are confirmed friends, as `viewer>owner`. */
  readonly friends = new Set<string>();

  async set(userId: string, specimenId: string, shared: boolean, photos: boolean) {
    await this.setMany(userId, [specimenId], shared, photos);
  }

  async setMany(userId: string, ids: readonly string[], shared: boolean, photos: boolean) {
    this.writes += 1;
    for (const id of ids)
      if (shared) this.rows.set(`${userId}:${id}`, photos);
      else this.rows.delete(`${userId}:${id}`);
  }

  async list(userId: string): Promise<readonly SharingRow[]> {
    return this.of(userId);
  }

  async sharedBy(userId: string, ownerId: string): Promise<readonly SharingRow[]> {
    return this.friends.has(`${userId}>${ownerId}`) ? this.of(ownerId) : [];
  }

  private of(owner: string): SharingRow[] {
    return [...this.rows]
      .filter(([k]) => k.startsWith(`${owner}:`))
      .map(([k, photos]) => ({ specimenId: k.slice(owner.length + 1), photos }));
  }
}

export class InMemorySpecimens implements SpecimenLookup {
  constructor(private readonly byOwner: Readonly<Record<string, readonly SpecimenFact[]>>) {}
  async find(userId: string, id: string) {
    return this.byOwner[userId]?.find((s) => s.id === id) ?? null;
  }
  async list(userId: string) {
    return this.byOwner[userId] ?? [];
  }
}

export class InMemoryPrivacy implements PrivacySwitch {
  readonly on = new Set<string>();
  async everythingPrivate(userId: string) {
    return this.on.has(userId);
  }
}

/** Facts per specimen id; a specimen id that is missing is left out like an archived one. */
export class InMemoryFacts implements SharedFacts {
  constructor(
    private readonly table: Readonly<Record<string, Omit<SharedSpecimen, "photoShared">>>,
  ) {}
  async describe(_ownerId: string, ids: readonly string[]) {
    return ids.flatMap((id) => (this.table[id] ? [this.table[id]] : []));
  }
}
