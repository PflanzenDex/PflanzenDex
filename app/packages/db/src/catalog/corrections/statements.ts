import type { Pool, PoolClient } from "pg";
import { withAccount } from "../../kernel/index.ts";
import type { CorrectionField, OpenCorrection, Vote, VoteOutcome } from "@pflanzendex/core";
import { COLUMN, FIELD, ISO } from "./fields.ts";

/** Sets, changes or (`null`) withdraws the vote of the account; the database function checks every rule (US-BES-15). */
export async function castVote(
  pool: Pool,
  userId: string,
  id: string,
  vote: Vote | null,
): Promise<VoteOutcome> {
  const r = await withAccount(pool, userId, (c) =>
    c.query<{ outcome: string }>("select vote_catalog_correction($1, $2) as outcome", [id, vote]),
  );
  const outcome = r.rows[0]?.outcome;
  return outcome === "voted" ||
    outcome === "decided" ||
    outcome === "own" ||
    outcome === "rate_limited"
    ? outcome
    : "not_found";
}

/** Open corrections of an approved species with counts and the own vote; `null` if the species is not approved or visible. */
export async function openCorrectionsOfSpecies(
  pool: Pool,
  userId: string,
  speciesId: string,
): Promise<readonly OpenCorrection[] | null> {
  return withAccount(pool, userId, async (c) => {
    const visible = await c.query<{ status: string | null }>(
      "select species_status(id) as status from species where id = $1",
      [speciesId],
    );
    const status = visible.rows[0]?.status;
    if (status !== "curated" && status !== "reviewed") return null;
    const r = await c.query<{
      id: string;
      field: string;
      proposedValue: string | null;
      reason: string;
      source: string | null;
      createdAt: string;
      confirmations: number;
      disputes: number;
      myVote: Vote | null;
      mine: boolean;
    }>(
      `select id, field, proposed_value as "proposedValue", reason, source, ${ISO("created_at")} as "createdAt",
              confirmations, disputes, my_vote as "myVote", is_mine as mine
         from open_species_corrections($1)`,
      [speciesId],
    );
    return r.rows.map((x): OpenCorrection => ({ ...x, field: FIELD[x.field] as CorrectionField }));
  });
}

/** Confirmations and disputes per open correction id (never who voted). */
export async function voteCounts(
  c: PoolClient,
  ids: readonly string[],
): Promise<Map<string, { confirmations: number; disputes: number }>> {
  const r = await c.query<{ id: string; confirmations: number; disputes: number }>(
    "select correction_id as id, confirmations, disputes from catalog_correction_vote_counts($1)",
    [ids],
  );
  return new Map(r.rows.map((x) => [x.id, x]));
}

// Decisions on corrections and reverts: database functions that check the role or the creator themselves (P-03, P-04).

export async function acceptCorrection(pool: Pool, userId: string, id: string) {
  const r = await withAccount(pool, userId, (c) =>
    c.query<{ outcome: string; version: number | null }>(
      "select outcome, version from accept_catalog_correction($1)",
      [id],
    ),
  );
  const row = r.rows[0];
  if (row?.outcome === "accepted" && row.version !== null) return { version: row.version };
  if (row?.outcome === "no_value") return "no_value" as const;
  return row?.outcome === "decided" ? ("decided" as const) : ("not_found" as const);
}

export async function withdrawCorrection(pool: Pool, userId: string, id: string) {
  const r = await withAccount(pool, userId, (c) =>
    c.query<{ outcome: string }>("select withdraw_catalog_correction($1) as outcome", [id]),
  );
  const outcome = r.rows[0]?.outcome;
  return outcome === "withdrawn" || outcome === "decided" ? outcome : ("not_found" as const);
}

export async function rejectCorrection(pool: Pool, userId: string, id: string, reason: string) {
  const r = await withAccount(pool, userId, (c) =>
    c.query<{ outcome: string }>("select reject_catalog_correction($1, $2) as outcome", [
      id,
      reason,
    ]),
  );
  const outcome = r.rows[0]?.outcome;
  return outcome === "rejected" || outcome === "decided" ? outcome : ("not_found" as const);
}

export async function revertField(
  pool: Pool,
  userId: string,
  target: { speciesId: string; field: CorrectionField; version: number },
) {
  const r = await withAccount(pool, userId, (c) =>
    c.query<{ outcome: string; version: number | null }>(
      "select outcome, version from revert_catalog_field($1, $2, $3)",
      [target.speciesId, COLUMN[target.field], target.version],
    ),
  );
  const row = r.rows[0];
  if (row?.outcome === "reverted" && row.version !== null) return { version: row.version };
  return row?.outcome === "unchanged" ? ("unchanged" as const) : ("not_found" as const);
}
