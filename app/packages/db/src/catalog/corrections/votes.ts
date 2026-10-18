import type { Pool, PoolClient } from "pg";
import { withAccount } from "../../kernel/index.ts";
import type { CorrectionField, OpenCorrection, Vote, VoteOutcome } from "@pflanzendex/core";
import { FIELD, ISO } from "./fields.ts";

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
      proposedValue: string;
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
