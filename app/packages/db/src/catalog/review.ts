import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shapes as the interface ReviewStore in `core` (structurally equal; `db` does not import `core`).
export type Role = "operator" | "reviewer";
export type ReviewStatus = "proposal" | "ai_unreviewed" | "curated" | "reviewed" | "rejected";
export interface ReviewCase {
  readonly id: string;
  readonly creatorId: string;
  readonly objectKind: string;
  readonly objectId: string;
  readonly status: ReviewStatus;
  readonly reason: string | null;
  readonly reviewedBy: string | null;
}

const COLUMNS = `id, account_id as "creatorId", object_kind as "objectKind", object_id as "objectId",
  status, reason, reviewed_by as "reviewedBy"`;

/** Adapter for the review status; every call runs as the caller's account under the row rules (P-04). */
export class ReviewPostgres {
  constructor(private readonly pool: Pool) {}

  async roles(userId: string): Promise<readonly Role[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ role: Role }>("select roles_of_account() as role"),
    );
    return r.rows.map((z) => z.role);
  }

  async create(
    userId: string,
    v: { objectKind: string; objectId: string; status: ReviewStatus },
  ): Promise<ReviewCase | "present"> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<ReviewCase>(
        `insert into review_case (account_id, object_kind, object_id, status) values ($1, $2, $3, $4)
         on conflict (object_kind, object_id) do nothing returning ${COLUMNS}`,
        [userId, v.objectKind, v.objectId, v.status],
      ),
    );
    return r.rows[0] ?? "present";
  }

  async find(userId: string, id: string): Promise<ReviewCase | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<ReviewCase>(`select ${COLUMNS} from review_case where id = $1`, [id]),
    );
    return r.rows[0] ?? null;
  }

  async decide(
    userId: string,
    id: string,
    status: "reviewed" | "rejected",
    reason: string | null,
  ): Promise<ReviewCase | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<ReviewCase>(
        `update review_case set status = $2, reason = $3 where id = $1 returning ${COLUMNS}`,
        [id, status, reason],
      ),
    );
    return r.rows[0] ?? null;
  }
}
