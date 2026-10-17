import type { Pool, PoolClient } from "pg";

// Module boundaries in the schema (AB-9, AB-10, AB-13; FR-QG-19, ADR 0003). The register comes from outside (app/config/lint/modules.config.mjs),
// so the runtime code of the database layer does not depend on a file outside the package.
export type ModuleRegister = {
  KERNEL: string;
  MODULES: { name: string; tables: string[]; dependsOn: string[] }[];
  /** Global reference tables (AB-10, ADR 0003 O-2): tables without account ID to which a simple reference is allowed. */
  GLOBAL_REFERENCE_TABLES?: Record<string, { owner: string; reason: string }>;
};

export type ForeignKey = {
  name: string;
  source: string;
  target: string;
  sourceColumns: string[];
  targetColumns: string[];
  /** Delete rule of the reference (pg_constraint.confdeltype): `r` = restrict, `a` = no action, `c` = cascade, ... */
  remove?: string;
};

type Query = Pool | PoolClient;

const COLUMNS = (rel: string, columns: string) =>
  `array(select a.attname::text from unnest(c.${columns}) with ordinality k(n, o)
         join pg_attribute a on a.attrelid = c.${rel} and a.attnum = k.n order by k.o)`;

export async function loadForeignKey(db: Query): Promise<ForeignKey[]> {
  const r = await db.query<ForeignKey>(
    `select c.conname as name, v.relname as source, z.relname as target,
            ${COLUMNS("conrelid", "conkey")} as "sourceColumns",
            ${COLUMNS("confrelid", "confkey")} as "targetColumns",
            c.confdeltype::text as remove
       from pg_constraint c
       join pg_class v on v.oid = c.conrelid
       join pg_class z on z.oid = c.confrelid
       join pg_namespace n on n.oid = v.relnamespace
      where c.contype = 'f' and n.nspname = 'public'
      order by v.relname, c.conname`,
  );
  return r.rows;
}

/**
 * Simple reference to a registered global reference table (AB-10, ADR 0003 O-2): only to `(id)` and only with `on
 * delete restrict`, so that deleting a used row fails instead of silently taking something along (P-10).
 */
function globalProblem(fk: ForeignKey, edge: string, entry: { owner: string; reason: string }) {
  const header = `AB-10 foreign key ${fk.name} (${fk.source} -> ${fk.target}), ${edge}`;
  if (!entry.reason?.trim())
    return `${header}: global reference table ${fk.target} without justification in the module register (GLOBAL_REFERENCE_TABLES)`;
  if (fk.sourceColumns.length !== 1 || fk.targetColumns.join(",") !== "id")
    return `${header}: to the global reference table ${fk.target} only as a simple reference to (id)`;
  return fk.remove === "r"
    ? null
    : `${header}: to the global reference table ${fk.target} only with on delete restrict`;
}

/** Foreign keys across module boundaries: only to allowed dependencies and only tenant-safe (account_id, id), AB-10. */
function fkProblem(
  fk: ForeignKey,
  sourceModule: string,
  targetModule: string,
  reg: ModuleRegister,
) {
  const edge = `${sourceModule} -> ${targetModule}`;
  const allowed = reg.MODULES.find((m) => m.name === sourceModule)?.dependsOn.includes(
    targetModule,
  );
  if (!allowed)
    return `AB-10 foreign key ${fk.name} (${fk.source} -> ${fk.target}), ${edge}: no allowed dependency in the module register`;
  const global = reg.GLOBAL_REFERENCE_TABLES?.[fk.target];
  if (global && global.owner === targetModule) return globalProblem(fk, edge, global);
  const safe =
    fk.sourceColumns.length === 2 &&
    fk.sourceColumns[0] === "account_id" &&
    fk.targetColumns.join(",") === "account_id,id";
  return safe
    ? null
    : `AB-10 foreign key ${fk.name} (${fk.source} -> ${fk.target}), ${edge}: across module boundaries only tenant-safe as (account_id, id) (or to a registered global reference table, GLOBAL_REFERENCE_TABLES)`;
}

/** Violations of AB-13 (table without module) and AB-10 (foreign keys across module boundaries); empty means fine. */
export function moduleViolations(
  tables: string[],
  fks: ForeignKey[],
  reg: ModuleRegister,
): string[] {
  const owner = new Map(reg.MODULES.flatMap((m) => m.tables.map((t) => [t, m.name] as const)));
  const out = tables
    .filter((t) => !owner.has(t))
    .map(
      (t) => `AB-13 table ${t}: belongs to no module (entry in app/config/lint/modules.config.mjs)`,
    );
  for (const fk of fks) {
    const source = owner.get(fk.source);
    const target = owner.get(fk.target);
    if (!source || !target || source === target) continue;
    if (fk.target === "account" && fk.targetColumns.join(",") === "id") continue; // Tenant anchor, allowed for all
    const problem = fkProblem(fk, source, target, reg);
    if (problem) out.push(problem);
  }
  return out;
}
