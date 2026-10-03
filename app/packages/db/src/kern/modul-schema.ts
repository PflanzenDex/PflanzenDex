import type { Pool, PoolClient } from "pg";

// Modulgrenzen im Schema (AB-9, AB-10, AB-13; FR-QG-19, ADR 0003). Das Register kommt von außen (app/modules.config.mjs),
// damit der Laufzeitcode der Datenbankschicht nicht von einer Datei außerhalb des Pakets abhängt.
export type ModulRegister = {
  KERN: string;
  MODULES: { name: string; tables: string[]; dependsOn: string[] }[];
  /** Globale Referenztabellen (AB-10, ADR 0003 O-2): Tabellen ohne Konto-Kennung, auf die ein einfacher Verweis erlaubt ist. */
  GLOBAL_REFERENCE_TABLES?: Record<string, { owner: string; reason: string }>;
};

export type Fremdschluessel = {
  name: string;
  von: string;
  nach: string;
  vonSpalten: string[];
  nachSpalten: string[];
  /** Löschregel des Verweises (pg_constraint.confdeltype): `r` = restrict, `a` = no action, `c` = cascade, ... */
  loeschen?: string;
};

type Abfrage = Pool | PoolClient;

const SPALTEN = (rel: string, spalten: string) =>
  `array(select a.attname::text from unnest(c.${spalten}) with ordinality k(n, o)
         join pg_attribute a on a.attrelid = c.${rel} and a.attnum = k.n order by k.o)`;

export async function ladeFremdschluessel(db: Abfrage): Promise<Fremdschluessel[]> {
  const r = await db.query<Fremdschluessel>(
    `select c.conname as name, v.relname as von, z.relname as nach,
            ${SPALTEN("conrelid", "conkey")} as "vonSpalten",
            ${SPALTEN("confrelid", "confkey")} as "nachSpalten",
            c.confdeltype::text as loeschen
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
 * Einfacher Verweis auf eine registrierte globale Referenztabelle (AB-10, ADR 0003 O-2): nur auf `(id)` und nur mit
 * `on delete restrict`, damit das Löschen einer benutzten Zeile scheitert statt still etwas mitzunehmen (P-10).
 */
function globalProblem(
  fk: Fremdschluessel,
  kante: string,
  eintrag: { owner: string; reason: string },
) {
  const kopf = `AB-10 Fremdschlüssel ${fk.name} (${fk.von} -> ${fk.nach}), ${kante}`;
  if (!eintrag.reason?.trim())
    return `${kopf}: globale Referenztabelle ${fk.nach} ohne Begründung im Modulregister (GLOBAL_REFERENCE_TABLES)`;
  if (fk.vonSpalten.length !== 1 || fk.nachSpalten.join(",") !== "id")
    return `${kopf}: auf die globale Referenztabelle ${fk.nach} nur als einfacher Verweis auf (id)`;
  return fk.loeschen === "r"
    ? null
    : `${kopf}: auf die globale Referenztabelle ${fk.nach} nur mit on delete restrict`;
}

/** Fremdschlüssel über Modulgrenzen: nur auf erlaubte Abhängigkeiten und nur mandantensicher (konto_id, id), AB-10. */
function fkProblem(fk: Fremdschluessel, vonModul: string, nachModul: string, reg: ModulRegister) {
  const kante = `${vonModul} -> ${nachModul}`;
  const erlaubt = reg.MODULES.find((m) => m.name === vonModul)?.dependsOn.includes(nachModul);
  if (!erlaubt)
    return `AB-10 Fremdschlüssel ${fk.name} (${fk.von} -> ${fk.nach}), ${kante}: keine erlaubte Abhängigkeit im Modulregister`;
  const global = reg.GLOBAL_REFERENCE_TABLES?.[fk.nach];
  if (global && global.owner === nachModul) return globalProblem(fk, kante, global);
  const sicher =
    fk.vonSpalten.length === 2 &&
    fk.vonSpalten[0] === "konto_id" &&
    fk.nachSpalten.join(",") === "konto_id,id";
  return sicher
    ? null
    : `AB-10 Fremdschlüssel ${fk.name} (${fk.von} -> ${fk.nach}), ${kante}: über Modulgrenzen nur mandantensicher als (konto_id, id) (oder auf eine registrierte globale Referenztabelle, GLOBAL_REFERENCE_TABLES)`;
}

/** Verstöße gegen AB-13 (Tabelle ohne Modul) und AB-10 (Fremdschlüssel über Modulgrenzen); leer heißt in Ordnung. */
export function modulVerstoesse(
  tabellen: string[],
  fks: Fremdschluessel[],
  reg: ModulRegister,
): string[] {
  const besitzer = new Map(reg.MODULES.flatMap((m) => m.tables.map((t) => [t, m.name] as const)));
  const out = tabellen
    .filter((t) => !besitzer.has(t))
    .map((t) => `AB-13 Tabelle ${t}: gehört keinem Modul (Eintrag in app/modules.config.mjs)`);
  for (const fk of fks) {
    const von = besitzer.get(fk.von);
    const nach = besitzer.get(fk.nach);
    if (!von || !nach || von === nach) continue;
    if (fk.nach === "konto" && fk.nachSpalten.join(",") === "id") continue; // Mandantenanker, für alle erlaubt
    const problem = fkProblem(fk, von, nach, reg);
    if (problem) out.push(problem);
  }
  return out;
}
