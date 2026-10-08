import type { Pool, PoolClient } from "pg";
import { loadForeignKey, moduleViolations, type ModuleRegister } from "./module-schema.ts";

// Tables without account id, each with a reason. Grows only deliberately and with review (FR-ACC-02, P-05).
export const WITHOUT_ACCOUNT_ID: Record<string, string> = {
  schema_migrations: "Tool bookkeeping of the migration tool, no user data",
  account_role:
    "Role assignment is the installation operator's job: the application role has no rights on the table and reads only its own role via roles_of_account() (TE-08)",
  invitation:
    "Invitation codes belong to the installation, not to an account (US-ACC-05): the application role has no rights on the table; the operator reaches it only through create_invitation() and list_invitations(), which check the role again, and registration through redeem_invitation(). Only hashes are stored",
  access_setting:
    "One row for the whole installation (registration by invitation on or off, US-ACC-05): no rights for the application role; read through invitation_required(), changed only through set_invitation_only() by the operator",
  operator_cost:
    "One row for the whole installation (the real monthly hosting cost entered by the operator, US-ACC-05, NFR-16): no rights for the application role; read through operator_cost() and changed through set_operator_cost(), both only by the operator",
};

/**
 * Exceptions a module contributes to the tenant check, composed in `schema-check.ts` (the kernel knows no module):
 * tables without account id with their reason, and those among them that need a row rule because they are visible by
 * a status instead (P-05).
 */
export interface TenantExceptions {
  readonly withoutAccountId: Readonly<Record<string, string>>;
  readonly ruleRequired: readonly string[];
}

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

function violation(z: Row, ex: TenantExceptions): string | null {
  if (z.name in ex.withoutAccountId)
    return ex.ruleRequired.includes(z.name) && ruleMissing(z)
      ? `Catalog table ${z.name}: row rule missing or not enforced (visibility by review status, FR-BES-11)`
      : null;
  if (!z.has_id)
    return `Table ${z.name}: no account id (column account_id, FR-ACC-02); without account only with an entry in WITHOUT_ACCOUNT_ID`;
  if (ruleMissing(z))
    return `Table ${z.name}: row rule missing or not enforced (after create table: select tenant_protection('${z.name}'))`;
  return null;
}

/**
 * Violations of the tenant rules in the schema; empty means fine. With the module register (app/config/lint/modules.config.mjs)
 * it also checks the module boundaries: table without module (AB-13) and foreign keys across module boundaries (AB-10).
 */
export async function checkSchema(
  db: Query,
  exceptions: TenantExceptions,
  register?: ModuleRegister,
): Promise<string[]> {
  const rows = await loadTables(db);
  const tenant = rows.map((z) => violation(z, exceptions)).filter((v): v is string => v !== null);
  if (!register) return tenant;
  const names = rows.map((z) => z.name);
  return [
    ...tenant,
    ...globalReferenceProblems(register, exceptions),
    ...moduleViolations(names, await loadForeignKey(db), register),
  ];
}

/** A global reference table (AB-10) is a table without account ID with a justified exception, nothing else. */
function globalReferenceProblems(register: ModuleRegister, ex: TenantExceptions): string[] {
  return Object.entries(register.GLOBAL_REFERENCE_TABLES ?? {}).flatMap(([tableName, e]) => {
    const problem = (text: string) => [`AB-10 global reference table ${tableName}: ${text}`];
    if (!e.reason?.trim()) return problem("without justification (GLOBAL_REFERENCE_TABLES)");
    if (!(tableName in ex.withoutAccountId))
      return problem("only tables with a justified exception in WITHOUT_ACCOUNT_ID are allowed");
    const owner = register.MODULES.find((m) => m.tables.includes(tableName))?.name;
    return owner === e.owner
      ? []
      : problem(`owner ${e.owner} does not match the module register (${owner})`);
  });
}
