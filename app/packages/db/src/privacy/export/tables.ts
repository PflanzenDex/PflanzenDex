import type { Pool, PoolClient } from "pg";
import { tenantsTables } from "../../kernel/index.ts";

// Which tables hold personal data of an account, and what happens to each in the export and the deletion
// (US-ACC-04, P-04, P-10). The list of tables is read from the catalog, not maintained by hand: a new table with an
// `account_id` is exported (and removed on deletion) without anybody remembering it. Only the exceptions below are
// written down, each with its reason, and `tables.test.ts` fails for every table that is neither a tenant table nor
// listed here.

/** Tables without personal data of the account, or closed to the application role: neither exported nor listed. */
export const NOT_EXPORTED: Record<string, string> = {
  schema_migrations: "Bookkeeping of the migration tool, no user data",
  idempotency: "Technical keys that make a repeated request harmless; no content of its own",
  job: "Background job queue; payloads carry ids, never copies of user data (P-05)",
  taxon: "Shared taxonomy cache of the Pokedex catalog, no account",
  taxon_attribute: "Shared researched species attributes with source and license, no account",
  catalog_source_snapshot: "Shared raw answers of the open sources per species, no account",
  catalog_field_provenance: "Shared origin of the catalog values, no account",
  account_role: "Role assignment of the installation operator, not the keeper's data",
  account_feature: "Opening of function groups by the installation operator, not the keeper's data",
  invitation: "Invitation codes of the installation (hashes only), not the keeper's data",
  access_setting: "One row for the whole installation",
  operator_cost: "One row for the whole installation",
  deletion_log: "Anonymous record of finished deletions (no account), kept for the operator",
  friend_code:
    "Single-use friend codes (hash only, closed to the application role); the friendship is exported",
};

/** Columns that are credentials or access tokens, never exported even though the row is (P-05). */
export const SECRET_COLUMNS: Record<string, readonly string[]> = {
  delivery_channel: ["endpoint", "p256dh", "auth"],
};

/** Columns that hold the name of a stored photo, as `<account id>/<name>` in the object store (US-WAC-06). */
export const PHOTO_COLUMNS: readonly { table: string; column: string }[] = [
  { table: "measurement", column: "photo" },
  { table: "wish", column: "image_object" },
];

type Query = Pool | PoolClient;
export type AccountTable = Awaited<ReturnType<typeof tenantsTables>>[number];

/** Quotes an identifier that came from the catalog. */
export const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** All exported tables: those of the schema `public` that assign their rows to an account (`account_id`, `account.id`). */
export async function accountTables(db: Query): Promise<AccountTable[]> {
  return (await tenantsTables(db)).filter((t) => !(t.name in NOT_EXPORTED));
}

/** Every table of the schema `public`, for the check that none is forgotten. */
export async function allTableNames(db: Query): Promise<string[]> {
  const r = await db.query<{ name: string }>(
    `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`,
  );
  return r.rows.map((z) => z.name);
}
