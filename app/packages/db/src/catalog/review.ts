import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";
import type { SpeciesRepointer } from "./repointer.ts";

// Same shapes as the interface ReviewStore in `core` (structurally equal; `db` does not import `core`).
export type Role = "operator" | "reviewer";
export type ReviewStatus =
  "proposal" | "ai_unreviewed" | "curated" | "reviewed" | "rejected" | "merged";
export interface ReviewCase {
  readonly id: string;
  readonly creatorId: string;
  readonly objectKind: string;
  readonly objectId: string;
  readonly status: ReviewStatus;
  readonly reason: string | null;
  readonly reviewedBy: string | null;
  readonly createdAt: string;
  readonly mergedInto: string | null;
}
export interface MergeOutcome {
  readonly reviewCase: ReviewCase;
  readonly moved: readonly { kind: string; moved: number; kept: number }[];
}

const COLUMNS = `id, account_id as "creatorId", object_kind as "objectKind", object_id as "objectId",
  status, reason, reviewed_by as "reviewedBy",
  to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt", merged_into as "mergedInto"`;
const UNIQUE_VIOLATION = "23505";
/** Latest operator batches shown next to the open proposals (assumption: starting value, no paging yet). */
const BATCH_LIMIT = 50;

/** Adapter for the review status; every call runs as the caller's account under the row rules (P-04). */
export class ReviewPostgres {
  /**
   * `repointers`: the ports of the modules that reference species (collection, later wishlist), composed by the API
   * (ADR 0003). The adapter itself touches no foreign table.
   */
  constructor(
    private readonly pool: Pool,
    private readonly repointers: readonly SpeciesRepointer[] = [],
  ) {}

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

  /** Open cases and the latest operator batches; row rules show them to reviewers only (P-04). */
  async listForReview(userId: string): Promise<readonly ReviewCase[]> {
    const r = await withAccount(this.pool, userId, async (c) => {
      const open = await c.query<ReviewCase>(
        `select ${COLUMNS} from review_case where status in ('proposal', 'ai_unreviewed') order by created_at, id`,
      );
      const batches = await c.query<ReviewCase>(
        `select ${COLUMNS} from review_case where status = 'curated' and object_kind = 'species'
          order by created_at desc, id limit ${BATCH_LIMIT}`,
      );
      return [...open.rows, ...batches.rows];
    });
    return r;
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

  /**
   * One transaction: close the case as `merged` (the database trigger lets only reviewers do it and only towards an
   * approved species), then re-point the creator's references through the ports. Any error rolls everything back.
   */
  async merge(
    userId: string,
    proposalId: string,
    targetSpeciesId: string,
  ): Promise<MergeOutcome | "conflict" | null> {
    try {
      return await withAccount(this.pool, userId, async (c) => {
        const proposal = await c.query<{ objectId: string }>(
          `select object_id as "objectId" from review_case where id = $1 and object_kind = 'species'`,
          [proposalId],
        );
        // Wait for writes of the creator on the proposal that are still in flight, then block new ones. If no row could
        // be locked the case is not an open proposal any more (nothing is merged, never a silent no-lock).
        if (!proposal.rows[0]) return null;
        const lock = await c.query<{ locked: boolean }>(
          "select lock_species_for_merge($1) as locked",
          [proposal.rows[0].objectId],
        );
        if (lock.rows[0]?.locked !== true) return null;
        const closed = await c.query<ReviewCase>(
          `update review_case set status = 'merged', merged_into = $2
            where id = $1 and object_kind = 'species' and status in ('proposal', 'ai_unreviewed')
            returning ${COLUMNS}`,
          [proposalId, targetSpeciesId],
        );
        const reviewCase = closed.rows[0];
        if (!reviewCase) return null;
        const moved = [];
        for (const port of this.repointers) {
          const done = await port.repoint(c, {
            creatorId: reviewCase.creatorId,
            fromSpeciesId: reviewCase.objectId,
            toSpeciesId: targetSpeciesId,
          });
          moved.push({ kind: port.kind, ...done });
        }
        return { reviewCase, moved };
      });
    } catch (e) {
      if ((e as { code?: string }).code === UNIQUE_VIOLATION) return "conflict";
      throw e;
    }
  }
}
