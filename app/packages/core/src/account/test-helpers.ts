import type { AccessCounts, AccessStore } from "./access";
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

type Role = "operator" | "reviewer";
type Invitation = { code: string; createdBy: string; expiresAt: string; redeemed: boolean };

/** In-memory adapter for tests only; the real adapter lives in `db`. One code works for one subject (single use). */
export class InMemoryAccess implements AccessStore {
  readonly invitations: (Invitation & { id: string })[] = [];
  readonly registered: string[] = [];
  readonly existing = new Set<string>();
  invitationOnly = false;
  modeWrites = 0;
  readonly modeSetBy: string[] = [];
  readonly overviewFor: string[] = [];
  overviewReads = 0;
  accounts = 0;
  active = 0;

  constructor(private readonly roleOf: Record<string, readonly Role[]>) {}

  async roles(userId: string): Promise<readonly Role[]> {
    return this.roleOf[userId] ?? [];
  }

  async createInvitation(userId: string, v: { code: string; expiresAt: string }) {
    const row = {
      ...v,
      createdBy: userId,
      redeemed: false,
      id: `inv-${this.invitations.length + 1}`,
    };
    this.invitations.push(row);
    return { id: row.id, expiresAt: v.expiresAt };
  }

  async setInvitationOnly(userId: string, on: boolean): Promise<void> {
    this.modeWrites += 1;
    this.modeSetBy.push(userId);
    this.invitationOnly = on;
  }

  async overview(userId: string): Promise<AccessCounts> {
    this.overviewReads += 1;
    this.overviewFor.push(userId);
    return {
      accounts: this.accounts,
      activeAccounts: this.active,
      invitationOnly: this.invitationOnly,
      invitations: this.invitations.map((i) => ({
        id: i.id,
        createdAt: "2026-10-04T10:00:00.000Z",
        expiresAt: i.expiresAt,
        redeemedAt: i.redeemed ? "2026-10-04T11:00:00.000Z" : null,
        status: i.redeemed ? "redeemed" : "open",
      })),
    };
  }

  async register(subject: string, code: string): Promise<"registered" | "existing" | "invalid"> {
    if (this.existing.has(subject)) return "existing";
    const invitation = this.invitations.find((i) => i.code === code);
    if (!invitation || invitation.redeemed || Date.parse(invitation.expiresAt) <= Date.now())
      return "invalid";
    invitation.redeemed = true;
    this.registered.push(subject);
    return "registered";
  }

  /** Test helper: the code runs out. */
  expire(code: string): void {
    const i = this.invitations.find((z) => z.code === code.replaceAll("-", ""));
    if (i) i.expiresAt = "2000-01-01T00:00:00.000Z";
  }
}
