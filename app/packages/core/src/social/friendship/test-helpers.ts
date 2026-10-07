import type {
  AnswerOutcome,
  FriendRecord,
  FriendRequest,
  FriendStore,
  RedeemResult,
} from "./types";

interface Code {
  readonly by: string;
  readonly expiresAt: string;
  redeemedBy: string | null;
}

/** In-memory adapter for tests only; the real adapter lives in `db`. Mirrors the rules of `request_friendship()`. */
export class InMemoryFriends implements FriendStore {
  readonly codes = new Map<string, Code>();
  rows: (Omit<FriendRequest, "status"> & {
    userId: string;
    otherId: string;
    status: "requested" | "confirmed" | "ended" | "declined";
    since: string | null;
  })[] = [];
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

  /** The refusal for a code, or `null` when it can be redeemed (same order as `request_friendship()`). */
  private refusal(userId: string, code: string): RedeemResult | null {
    const c = this.codes.get(code);
    if (!c) return { outcome: "unknown_code" };
    if (c.by === userId) return { outcome: "own_code" };
    const mine = this.rows.find((r) => r.userId === userId && r.otherId === c.by);
    if (c.redeemedBy !== null) return this.again(userId, c, mine);
    if (new Date(c.expiresAt) <= this.now()) return { outcome: "code_expired" };
    const linked = mine?.status === "requested" || mine?.status === "confirmed";
    return linked ? { outcome: "already_linked" } : null;
  }

  /** A used code: the same account gets its request back, everybody else is told the code is used. */
  private again(
    userId: string,
    c: Code,
    mine: (typeof this.rows)[number] | undefined,
  ): RedeemResult {
    return c.redeemedBy === userId && mine?.status === "requested"
      ? { outcome: "requested", request: bare(mine) }
      : { outcome: "code_used" };
  }

  async requestWithCode(userId: string, code: string): Promise<RedeemResult> {
    const refused = this.refusal(userId, code);
    if (refused) return refused;
    const c = this.codes.get(code) as Code;
    this.writes += 1;
    c.redeemedBy = userId;
    this.rows = this.rows.filter((r) => !pairOf(r, userId, c.by));
    const at = this.now().toISOString();
    const side = (owner: string, other: string, direction: "sent" | "received") => ({
      id: `00000000-0000-4000-8000-${String(this.rows.length + 1).padStart(12, "0")}`,
      userId: owner,
      otherId: other,
      otherName: this.names[other] ?? null,
      direction,
      requestedAt: at,
      status: "requested" as const,
      since: null,
    });
    this.rows.push(side(c.by, userId, "received"));
    const own = side(userId, c.by, "sent");
    this.rows.push(own);
    return { outcome: "requested", request: bare(own) };
  }

  async openRequests(userId: string): Promise<readonly FriendRequest[]> {
    return this.rows
      .filter(
        (r) =>
          r.userId === userId &&
          (r.status === "requested" || (r.status === "declined" && r.direction === "sent")),
      )
      .map(bare)
      .reverse();
  }

  async answer(userId: string, requestId: string, accept: boolean): Promise<AnswerOutcome> {
    const mine = this.rows.find(
      (r) => r.userId === userId && r.id === requestId && r.direction === "received",
    );
    if (!mine) return "not_found";
    const target = accept ? "confirmed" : "declined";
    if (mine.status !== "requested") return mine.status === target ? target2(accept) : "not_open";
    this.writes += 1;
    const at = this.now().toISOString();
    for (const r of this.rows.filter((x) => pairOf(x, userId, mine.otherId))) {
      r.status = target;
      r.since = accept ? at : null;
    }
    return target2(accept);
  }

  async end(userId: string, friendId: string): Promise<"ended" | "not_found"> {
    const mine = this.rows.find((r) => r.userId === userId && r.id === friendId);
    if (!mine || (mine.status !== "confirmed" && mine.status !== "ended")) return "not_found";
    if (mine.status === "confirmed") {
      this.writes += 1;
      for (const r of this.rows.filter((x) => pairOf(x, userId, mine.otherId))) r.status = "ended";
    }
    return "ended";
  }

  async friends(userId: string): Promise<readonly FriendRecord[]> {
    return this.rows
      .filter((r) => r.userId === userId && r.status === "confirmed")
      .map((r) => ({
        id: r.id,
        name: r.otherName,
        since: r.since as string,
        accountId: r.otherId,
      }));
  }
}

const bare = ({
  id,
  otherName,
  direction,
  requestedAt,
  status,
}: Omit<FriendRequest, "status"> & { status: string }): FriendRequest => ({
  id,
  otherName,
  direction,
  requestedAt,
  status: status === "declined" ? "declined" : "requested",
});

/** Deterministic "random" bytes for tests. */
export const fixedRandom = (seed: number) => (n: number) =>
  Uint8Array.from({ length: n }, (_, i) => (seed + i * 7) & 255);

const target2 = (accept: boolean): AnswerOutcome => (accept ? "accepted" : "declined");

/** Whether the row belongs to the pair of accounts, from either side. */
const pairOf = (r: { userId: string; otherId: string }, a: string, b: string) =>
  (r.userId === a && r.otherId === b) || (r.userId === b && r.otherId === a);
