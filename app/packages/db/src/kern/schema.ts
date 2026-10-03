import type { Pool, PoolClient } from "pg";

// Tabellen ohne Konto-Kennung, jeweils mit Begründung. Wächst nur bewusst und mit Review (FR-ACC-02, P-05).
export const OHNE_KONTO_KENNUNG: Record<string, string> = {
  schema_migrations: "Werkzeug-Verwaltung des Migrationswerkzeugs, keine Nutzerdaten",
  konto_rolle:
    "Rollenvergabe ist Sache des Betreibers der Installation: die Anwendungsrolle hat keine Rechte auf die Tabelle und liest nur die eigene Rolle über rollen_des_kontos() (TE-08)",
  // Der gemeinsame Artenkatalog (BES) trägt keine Konto-Kennung; er wird hier mit Begründung eingetragen.
};

// Tabellen, deren Konto-Kennung nicht `konto_id` heißt: die Konto-Tabelle ist die Wurzel (`id`).
export const ANDERE_KENNUNG: Record<string, string> = { konto: "id" };

export type MandantenTabelle = { name: string; kennung: string };

type Abfrage = Pool | PoolClient;

type Zeile = {
  name: string;
  hat_kennung: boolean;
  rls: boolean;
  erzwungen: boolean;
  regeln: number;
};

async function ladeTabellen(db: Abfrage): Promise<Zeile[]> {
  const r = await db.query<Zeile & { kennung: string }>(
    `select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as erzwungen,
            (select count(*)::int from pg_policy p where p.polrelid = c.oid) as regeln,
            coalesce(k.kennung, 'konto_id') as kennung,
            exists (select from pg_attribute a where a.attrelid = c.oid and a.attnum > 0
                    and not a.attisdropped and a.attname = coalesce(k.kennung, 'konto_id')) as hat_kennung
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       left join (select unnest($1::text[]) as tabelle, unnest($2::text[]) as kennung) k on k.tabelle = c.relname
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by c.relname`,
    [Object.keys(ANDERE_KENNUNG), Object.values(ANDERE_KENNUNG)],
  );
  return r.rows;
}

/** Alle Tabellen im Schema `public`, die ihre Zeilen einem Konto zuordnen. */
export async function mandantenTabellen(db: Abfrage): Promise<MandantenTabelle[]> {
  const zeilen = await ladeTabellen(db);
  return zeilen
    .filter((z) => z.hat_kennung)
    .map((z) => ({ name: z.name, kennung: ANDERE_KENNUNG[z.name] ?? "konto_id" }));
}

function verstoss(z: Zeile): string | null {
  if (z.name in OHNE_KONTO_KENNUNG) return null;
  if (!z.hat_kennung)
    return `Tabelle ${z.name}: keine Konto-Kennung (Spalte konto_id, FR-ACC-02); ohne Konto nur mit Eintrag in OHNE_KONTO_KENNUNG`;
  if (!z.rls || !z.erzwungen || z.regeln === 0)
    return `Tabelle ${z.name}: Zeilenregel fehlt oder wird nicht erzwungen (nach create table: select mandantenschutz('${z.name}'))`;
  return null;
}

/** Verstöße gegen die Mandantenregeln im Schema; leer heißt in Ordnung. */
export async function findeSchemaVerstoesse(db: Abfrage): Promise<string[]> {
  const zeilen = await ladeTabellen(db);
  return zeilen.map(verstoss).filter((v): v is string => v !== null);
}
