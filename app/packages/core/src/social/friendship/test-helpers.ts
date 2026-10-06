import type { FriendRequest, FriendStore, RedeemResult } from "./types";

interface Code {
  readonly by: string;
  readonly expiresAt: string;
  redeemedBy: string | null;
}

/** In-memory adapter for tests only; the real adapter lives in `db`. Mirrors the rules of `request_friendship()`. */
export class InMemoryFriends implements FriendStore {
  readonly codes = new Map<string, Code>();
  readonly rows: (FriendRequest & { userId: string; otherId: string; status: string })[] = [];
  writes = 0;

  constructor(
    private readonly names: Readonly<Record<string, string | null>>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createCode(userId: string, v: { code: string; expiresAt: string }) {
    this.writes += 1;
    this.codes.set(v.code, { by: userId, expiresAt: v.expiresAt, redeemedBy: null });
    return { id: `c${this.codes.size}`, expiresAt: v.expiresAt };
  }

  async requestWithCode(userId: string, code: string): Promise<RedeemResult> {
    const c = this.codes.get(code);
    if (!c) return { outcome: "unknown_code" };
    if (c.by === userId) return { outcome: "own_code" };
    const mine = this.rows.find((r) => r.userId === userId && r.otherId === c.by);
    if (c.redeemedBy !== null) {
      return c.redeemedBy === userId && mine?.status === "requested"
        ? { outcome: "requested", request: bare(mine) }
        : { outcome: "code_used" };
    }
    if (new Date(c.expiresAt) <= this.now()) return { outcome: "code_expired" };
    if (mine && mine.status !== "ended") return { outcome: "already_linked" };
    this.writes += 1;
    c.redeemedBy = userId;
    const at = this.now().toISOString();
    const side = (owner: string, other: string, direction: "sent" | "received") => ({
      id: `f${this.rows.length + 1}`,
      userId: owner,
      otherId: other,
      otherName: this.names[other] ?? null,
      direction,
      requestedAt: at,
      status: "requested",
    });
    this.rows.push(side(c.by, userId, "received"));
    const own = side(userId, c.by, "sent");
    this.rows.push(own);
    return { outcome: "requested", request: bare(own) };
  }

  async openRequests(userId: string): Promise<readonly FriendRequest[]> {
    return this.rows
      .filter((r) => r.userId === userId && r.status === "requested")
      .map(bare)
      .reverse();
  }
}

const bare = ({ id, otherName, direction, requestedAt }: FriendRequest): FriendRequest => ({
  id,
  otherName,
  direction,
  requestedAt,
});

/** Deterministic "random" bytes for tests. */
export const fixedRandom = (seed: number) => (n: number) =>
  Uint8Array.from({ length: n }, (_, i) => (seed + i * 7) & 255);
