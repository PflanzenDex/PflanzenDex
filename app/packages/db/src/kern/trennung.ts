import type { Pool, PoolClient } from "pg";
import { mitKonto } from "./mandant.ts";
import { mandantenTabellen, type MandantenTabelle } from "./schema.ts";

/** Womit eine Fixture ihre Voraussetzungen anlegen kann: die Kennung des Kontos und dessen Sitzung (P-04). */
export interface FixtureKontext {
  readonly kontoId: string;
  readonly abfrage: PoolClient;
}

/**
 * Beispielwerte je Tabelle für die Spalten außer der Konto-Kennung. Verweist die Tabelle auf eine andere Zeile des
 * Kontos (zusammengesetzter Fremdschlüssel), legt die Fixture diese über den Kontext an und liefert ihre Kennung.
 */
export type Fixtures = Record<
  string,
  (kontext: FixtureKontext) => Record<string, unknown> | Promise<Record<string, unknown>>
>;

const q = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function einfuegen(pool: Pool, t: MandantenTabelle, kontoId: string, fx: Fixtures) {
  await mitKonto(pool, kontoId, async (c) => {
    const werte = { ...(await fx[t.name]?.({ kontoId, abfrage: c })), [t.kennung]: kontoId };
    const spalten = Object.keys(werte);
    const sql = `insert into ${q(t.name)} (${spalten.map(q).join(", ")}) values (${spalten.map((_, i) => `$${i + 1}`).join(", ")})`;
    await c.query(sql, Object.values(werte));
  });
}

async function zaehle(pool: Pool, t: MandantenTabelle, kontoId: string): Promise<number> {
  const r = await pool.query(
    `select count(*)::int as n from ${q(t.name)} where ${q(t.kennung)} = $1`,
    [kontoId],
  );
  return r.rows[0].n;
}

async function raeume(pool: Pool, tabellen: MandantenTabelle[], konten: string[]) {
  for (const t of [...tabellen].reverse())
    await pool.query(`delete from ${q(t.name)} where ${q(t.kennung)} = any($1)`, [konten]);
}

/** Versucht als `angreifer` fremde Zeilen von `opfer` zu lesen, zu ändern, zu löschen oder einzuschleusen. */
async function greifAn(
  pool: Pool,
  t: MandantenTabelle,
  angreifer: string,
  opfer: string,
): Promise<string[]> {
  const probleme: string[] = [];
  const k = q(t.kennung);
  const lesen = await mitKonto(pool, angreifer, (c) => c.query(`select ${k} from ${q(t.name)}`));
  if (lesen.rows.some((z) => z[t.kennung] !== angreifer))
    probleme.push("liest Zeilen eines fremden Kontos");
  const aendern = await mitKonto(pool, angreifer, (c) =>
    c.query(`update ${q(t.name)} set ${k} = ${k}`),
  );
  if (aendern.rowCount !== 1)
    probleme.push(`ändert ${aendern.rowCount} statt nur der eigenen Zeile`);
  const umhaengen = mitKonto(pool, angreifer, (c) =>
    c.query(`update ${q(t.name)} set ${k} = $1`, [opfer]),
  );
  if (
    await umhaengen.then(
      () => true,
      () => false,
    )
  )
    probleme.push("kann eine Zeile einem fremden Konto zuschreiben");
  const loeschen = await mitKonto(pool, angreifer, (c) => c.query(`delete from ${q(t.name)}`));
  if (loeschen.rowCount !== 1)
    probleme.push(`löscht ${loeschen.rowCount} statt nur der eigenen Zeile`);
  if ((await zaehle(pool, t, opfer)) !== 1)
    probleme.push("hat eine Zeile des fremden Kontos verändert oder gelöscht");
  return probleme;
}

async function ohneKonto(pool: Pool, t: MandantenTabelle): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role pflanzendex_app");
    const r = await client.query(`select 1 from ${q(t.name)}`);
    return r.rowCount === 0 ? [] : ["liefert ohne Konto in der Sitzung Zeilen"];
  } finally {
    await client.query("rollback");
    client.release();
  }
}

async function pruefeTabelle(pool: Pool, t: MandantenTabelle, a: string, b: string, fx: Fixtures) {
  if (!(t.name in fx))
    return ["keine Fixture in fixtures.ts: Tabelle ist nicht in den Mandantentest aufgenommen"];
  const probleme: string[] = [];
  for (const [angreifer, opfer] of [
    [a, b],
    [b, a],
  ] as const) {
    await raeume(pool, [t], [a, b]);
    await einfuegen(pool, t, angreifer, fx);
    await einfuegen(pool, t, opfer, fx);
    probleme.push(...(await greifAn(pool, t, angreifer, opfer)));
    await raeume(pool, [t], [a, b]);
  }
  await einfuegen(pool, t, a, fx);
  probleme.push(...(await ohneKonto(pool, t)));
  await raeume(pool, [t], [a, b]);
  return probleme;
}

async function legeKontenAn(pool: Pool, konten: string[]) {
  for (const id of konten)
    await mitKonto(pool, id, (c) =>
      c.query("insert into konto (id) values ($1) on conflict do nothing", [id]),
    );
}

/**
 * Generischer Mandantentest (QG-D1, NFR-09): für jede Tabelle mit Konto-Kennung legen zwei Konten je eine Zeile an;
 * dann darf Konto A weder die Zeile von B lesen, ändern, umhängen noch löschen, und umgekehrt.
 * Gibt die Probleme als Text zurück (leer heißt bestanden). Die Testkonten werden zuletzt wieder entfernt.
 */
export async function pruefeMandantentrennung(
  pool: Pool,
  fixtures: Fixtures,
  kontoA: string,
  kontoB: string,
): Promise<string[]> {
  const tabellen = await mandantenTabellen(pool);
  // Die Konto-Tabelle zuletzt: ihr Löschen reißt über die Fremdschlüssel die Zeilen der anderen mit.
  const reihenfolge = [
    ...tabellen.filter((t) => t.name !== "konto"),
    ...tabellen.filter((t) => t.name === "konto"),
  ];
  const probleme: string[] = [];
  try {
    for (const t of reihenfolge) {
      if (t.name !== "konto") await legeKontenAn(pool, [kontoA, kontoB]);
      for (const p of await pruefeTabelle(pool, t, kontoA, kontoB, fixtures))
        probleme.push(`${t.name}: ${p}`);
    }
  } finally {
    await pool.query("delete from konto where id = any($1)", [[kontoA, kontoB]]);
  }
  return probleme;
}
