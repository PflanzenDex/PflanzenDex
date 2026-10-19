import type { Pool } from "pg";

// #907, P-04, QG-D1: a `security definer` function runs with the owner's rights and ignores row-level security when the
// owner is a superuser or has BYPASSRLS. The check below makes that visible at start-up instead of in production data.

/** `off`: no check; `warn`: log and go on (default, local development uses the superuser of the image); `enforce`: refuse to start. */
export type RoleCheckMode = "off" | "warn" | "enforce";

export function roleCheckMode(env: Record<string, string | undefined>): RoleCheckMode {
  const value = env["DB_ROLE_CHECK"];
  if (value === undefined || value === "") return "warn";
  if (value === "off" || value === "warn" || value === "enforce") return value;
  throw new Error(`DB_ROLE_CHECK must be off, warn or enforce (got "${value}")`);
}

interface RoleRow {
  readonly connection: string;
  readonly connection_privileged: boolean;
  readonly owner: string | null;
  readonly owner_privileged: boolean | null;
  readonly app_privileged: boolean | null;
}

/**
 * What is wrong with the database roles, in plain words; empty when all is well. Looks at the role of this connection,
 * at the owner of the tenant root table `account` and at the application role `pflanzendex_app`: none of them may be a
 * superuser or have BYPASSRLS (the connection role matters for statements that run without `set role`, the owner for
 * `security definer` functions, the application role for every request).
 */
export async function dbRoleFindings(pool: Pool): Promise<readonly string[]> {
  const r = await pool.query<RoleRow>(
    `select current_user::text as connection,
            (select rolsuper or rolbypassrls from pg_roles where rolname = current_user) as connection_privileged,
            (select o.rolname from pg_class c join pg_roles o on o.oid = c.relowner
              where c.oid = to_regclass('public.account'))::text as owner,
            (select o.rolsuper or o.rolbypassrls from pg_class c join pg_roles o on o.oid = c.relowner
              where c.oid = to_regclass('public.account')) as owner_privileged,
            (select rolsuper or rolbypassrls from pg_roles where rolname = 'pflanzendex_app') as app_privileged`,
  );
  const row = r.rows[0] as RoleRow;
  const found: string[] = [];
  if (row.connection_privileged)
    found.push(`the database connection runs as ${row.connection}, a superuser or BYPASSRLS role`);
  if (row.owner_privileged)
    found.push(
      `the tables are owned by ${row.owner}, a superuser or BYPASSRLS role: security definer functions ignore row-level security`,
    );
  if (row.app_privileged)
    found.push(
      "the application role pflanzendex_app is a superuser or has BYPASSRLS: row-level security does not apply to requests",
    );
  return found;
}

/** Applies the mode: logs every finding (`warn`) or throws one error naming all of them (`enforce`). */
export async function checkDbRoles(
  pool: Pool,
  mode: RoleCheckMode,
  warn: (message: string) => void,
): Promise<void> {
  if (mode === "off") return;
  const findings = await dbRoleFindings(pool);
  if (findings.length === 0) return;
  const hint =
    'see docs/guides/operations/staging-deploy-and-backup.md, section "DB roles in production"';
  if (mode === "enforce")
    throw new Error(
      `Unsafe database roles (DB_ROLE_CHECK=enforce): ${findings.join("; ")}; ${hint}`,
    );
  for (const finding of findings) warn(`DB role check: ${finding}; ${hint}`);
}
