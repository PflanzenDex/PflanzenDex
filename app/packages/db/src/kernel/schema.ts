import type { Pool, PoolClient } from "pg";
import { loadForeignKey, moduleViolations, type ModuleRegister } from "./module-schema.ts";

// Tables without account id, each with a reason. Grows only deliberately and with review (FR-ACC-02, P-05).
export const WITHOUT_ACCOUNT_ID: Record<string, string> = {
  schema_migrations: "Tool bookkeeping of the migration tool, no user data",
  account_role:
    "Role assignment is the installation operator's job: the application role has no rights on the table and reads only its own role via roles_of_account() (TE-08)",
  species:
    "Shared species catalog (E-02): knowledge that belongs to everyone. Visible are approved species and the own proposals, determined by the review case (species_status(), FR-BES-11); the application can neither change nor delete (BES-01)",
  species_name:
    "Names and synonyms of a species: visible and creatable exactly like the associated species (species_status(), species_own())",
};

// Catalog tables without account id still need enforced row rules: they are not tenant-bound,
// but visible by review status. Without a rule, private proposals would be readable by all (P-05).
export const CATALOG_TABLES: readonly string[] = ["species", "species_name"];

// Tables whose account id is not called `account_id`: the account table is the root (`id`).
export const OTHER_ID: Record<string, string> = { account: "id" };

export type TenantsTableName = { name: string; id: string };

type Query = Pool | PoolClient;

type Row = {
  name: string;
  has_id: boolean;
  rls: boolean;
  enforced: boolean;
  rules: number;
};

async function loadTables(db: Query): Promise<Row[]> {
  const r = await db.query<Row & { id: string }>(
    `select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as enforced,
            (select count(*)::int from pg_policy p where p.polrelid = c.oid) as rules,
            coalesce(k.id, 'account_id') as id,
            exists (select from pg_attribute a where a.attrelid = c.oid and a.attnum > 0
                    and not a.attisdropped and a.attname = coalesce(k.id, 'account_id')) as has_id
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       left join (select unnest($1::text[]) as table_name, unnest($2::text[]) as id) k on k.table_name = c.relname
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by c.relname`,
    [Object.keys(OTHER_ID), Object.values(OTHER_ID)],
  );
  return r.rows;
}

/** All tables in the schema `public` that assign their rows to an account. */
export async function tenantsTables(db: Query): Promise<TenantsTableName[]> {
  const rows = await loadTables(db);
  return rows
    .filter((z) => z.has_id)
    .map((z) => ({ name: z.name, id: OTHER_ID[z.name] ?? "account_id" }));
}

const ruleMissing = (z: Row) => !z.rls || !z.enforced || z.rules === 0;

function violation(z: Row): string | null {
  if (z.name in WITHOUT_ACCOUNT_ID)
    return CATALOG_TABLES.includes(z.name) && ruleMissing(z)
      ? `Catalog table ${z.name}: row rule missing or not enforced (visibility by review status, FR-BES-11)`
      : null;
  if (!z.has_id)
    return `Table ${z.name}: no account id (column account_id, FR-ACC-02); without account only with an entry in WITHOUT_ACCOUNT_ID`;
  if (ruleMissing(z))
    return `Table ${z.name}: row rule missing or not enforced (after create table: select tenant_protection('${z.name}'))`;
  return null;
}

/**
 * Violations of the tenant rules in the schema; empty means fine. With the module register (app/modules.config.mjs)
 * it also checks the module boundaries: table without module (AB-13) and foreign keys across module boundaries (AB-10).
 */
export async function findSchemaViolations(
  db: Query,
  register?: ModuleRegister,
): Promise<string[]> {
  const rows = await loadTables(db);
  const tenant = rows.map(violation).filter((v): v is string => v !== null);
  if (!register) return tenant;
  const names = rows.map((z) => z.name);
  return [
    ...tenant,
    ...globalReferenceProblems(register),
    ...moduleViolations(names, await loadForeignKey(db), register),
  ];
}

/** A global reference table (AB-10) is a table without account ID with a justified exception, nothing else. */
function globalReferenceProblems(register: ModuleRegister): string[] {
  return Object.entries(register.GLOBAL_REFERENCE_TABLES ?? {}).flatMap(([tableName, e]) => {
    const problem = (text: string) => [`AB-10 global reference table ${tableName}: ${text}`];
    if (!e.reason?.trim()) return problem("without justification (GLOBAL_REFERENCE_TABLES)");
    if (!(tableName in WITHOUT_ACCOUNT_ID))
      return problem("only tables with a justified exception in WITHOUT_ACCOUNT_ID are allowed");
    const owner = register.MODULES.find((m) => m.tables.includes(tableName))?.name;
    return owner === e.owner
      ? []
      : problem(`owner ${e.owner} does not match the module register (${owner})`);
  });
}
