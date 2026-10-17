import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

// Helpers for the tests of the deletion of an account (US-ACC-04). The deletion touches tables of several modules, and
// tests of one module write no SQL on foreign tables (AB-9), so the setup and the checks of the other modules live here.
export interface Person {
  readonly id: string;
  readonly name: string;
}

// They work across accounts and need the superuser connection (`openFixturePool`).

/** A confirmed friendship between two accounts; each side stores the display name of the other. */
export async function befriend(admin: Pool, a: Person, b: Person) {
  for (const [side, other] of [
    [a, b],
    [b, a],
  ] as const)
    await admin.query(
      `insert into friendship (account_id, other_id, other_name, direction, status, since)
       values ($1, $2, $3, 'sent', 'confirmed', now())`,
      [side.id, other.id, other.name],
    );
}

export const friendshipsOf = async (admin: Pool, account: string) =>
  (await admin.query("select 1 from friendship where account_id = $1", [account])).rows.length;

/** Both sides of one swap: `giver` offers, `recipient` asks. */
export async function createSwap(
  admin: Pool,
  swap: { swapId: string; status: string },
  giver: Person,
  recipient: Person,
) {
  const offer = randomUUID();
  for (const [side, role, other] of [
    [giver, "giver", recipient],
    [recipient, "recipient", giver],
  ] as const)
    await admin.query(
      `insert into swap (account_id, swap_id, role, other_id, other_name, offer_id, type, mode, status)
       values ($1, $2, $3, $4, $5, $6, 'cutting', 'swap', $7)`,
      [side.id, swap.swapId, role, other.id, other.name, offer, swap.status],
    );
}

export async function swapOf(admin: Pool, account: string, swapId: string) {
  const r = await admin.query(
    "select other_id, other_name, status, cause from swap where account_id = $1 and swap_id = $2",
    [account, swapId],
  );
  return r.rows;
}

/** One species of the account in the shared catalog (curated) and one that only the account can see (proposal). */
export async function createCatalogContributions(
  admin: Pool,
  account: string,
  ids: { shared: string; proposal: string },
) {
  const c = await admin.connect();
  try {
    await c.query("begin");
    // Species and review case point at each other; the guard trigger would refuse a curated case from a non-reviewer.
    await c.query("set local session_replication_role = replica");
    for (const [id, status] of [
      [ids.shared, "curated"],
      [ids.proposal, "proposal"],
    ] as const) {
      await c.query(
        `insert into review_case (account_id, object_kind, object_id, status) values ($1, 'species', $2, $3)`,
        [account, id, status],
      );
      await c.query(
        `insert into species (id, genus, latin_name, difficulty, standard_level, light_demand_lux,
           growth_measure, etiolation_signs, success_criteria, created_by)
         values ($1, 'Erasus', $2, 1, 2, 100, 'height', 'v', 'e', 'user')`,
        [id, `Erasus ${id}`],
      );
    }
    await c.query("commit");
  } finally {
    c.release();
  }
}

/** What is left of the two contributions: the case of the shared one (creator and status) and the row counts. */
export async function catalogContributions(admin: Pool, ids: { shared: string; proposal: string }) {
  const count = async (sql: string, id: string) => (await admin.query(sql, [id])).rows.length;
  return {
    sharedCase: (
      await admin.query("select account_id, status from review_case where object_id = $1", [
        ids.shared,
      ])
    ).rows,
    sharedSpecies: await count("select 1 from species where id = $1", ids.shared),
    proposalSpecies: await count("select 1 from species where id = $1", ids.proposal),
    proposalCase: await count("select 1 from review_case where object_id = $1", ids.proposal),
  };
}

/** Removes the contributions and the accounts of a test (the species restrict the deletion of their cases). */
export async function removeCatalogContributions(admin: Pool, ids: string[], accounts: string[]) {
  const c = await admin.connect();
  try {
    await c.query("begin");
    await c.query("set local session_replication_role = replica");
    await c.query("delete from species where id = any($1)", [ids]);
    await c.query("delete from review_case where object_id = any($1)", [ids]);
    await c.query("delete from account where id = any($1)", [accounts]);
    await c.query("commit");
  } finally {
    c.release();
  }
}

/** Gives the account's measurement and wish a stored photo each, so the export has files to name. */
export async function attachPhotos(admin: Pool, account: string, names: [string, string]) {
  await admin.query("update measurement set photo = $2 where account_id = $1", [account, names[0]]);
  await admin.query("update wish set image_object = $2 where account_id = $1", [account, names[1]]);
}
