import { defaultNotifications, type AccountProfile, type ProfileStore } from "./profile";

/** In-memory adapter for tests only; the real adapter lives in `db`. `known` are the accounts with a data row. */
export class InMemoryProfiles implements ProfileStore {
  readonly rows = new Map<string, AccountProfile>();
  writes = 0;
  /** The account of every write, in order: shows which account an operation really wrote for. */
  readonly writtenFor: string[] = [];

  constructor(known: readonly string[]) {
    for (const id of known)
      this.rows.set(id, {
        displayName: null,
        timeZone: null,
        everythingPrivate: false,
        noRecommendations: false,
        notifications: defaultNotifications(),
      });
  }

  async find(userId: string): Promise<AccountProfile | null> {
    return this.rows.get(userId) ?? null;
  }

  async update(userId: string, profile: AccountProfile): Promise<AccountProfile | null> {
    if (!this.rows.has(userId)) return null;
    this.writes += 1;
    this.writtenFor.push(userId);
    this.rows.set(userId, profile);
    return profile;
  }
}
