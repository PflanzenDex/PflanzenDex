import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";

export const MIGRATIONS_VERZEICHNIS = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);
export const MIGRATIONS_TABELLE = "schema_migrations";

export type MigrationsOptionen = { verzeichnis?: string; tabelle?: string };

const pruefsumme = (inhalt: string) => createHash("sha256").update(inhalt).digest("hex");

/**
 * Wendet noch nicht angewendete `*.sql`-Dateien in Namensreihenfolge an, jede in einer eigenen Transaktion.
 * Nur vorwärts: eine bereits angewendete Datei darf sich nie ändern (Prüfsumme). Gibt die neu angewendeten Namen zurück.
 * Ein Advisory-Lock verhindert, dass zwei Prozesse gleichzeitig migrieren.
 */
export async function migriere(pool: Pool, optionen: MigrationsOptionen = {}): Promise<string[]> {
  const verzeichnis = optionen.verzeichnis ?? MIGRATIONS_VERZEICHNIS;
  const tabelle = optionen.tabelle ?? MIGRATIONS_TABELLE;
  const dateien = readdirSync(verzeichnis)
    .filter((d) => d.endsWith(".sql"))
    .sort();
  const client = await pool.connect();
  const angewendet: string[] = [];
  try {
    await client.query("select pg_advisory_lock(hashtext($1))", [tabelle]);
    await client.query(
      `create table if not exists ${tabelle} (name text primary key, pruefsumme text not null, angewendet_am timestamptz not null default now())`,
    );
    const bekannt = await ladeBekannte(client, tabelle);
    for (const name of dateien) {
      const inhalt = readFileSync(join(verzeichnis, name), "utf8");
      const alt = bekannt.get(name);
      if (alt === undefined) {
        await wendeAn(client, tabelle, name, inhalt);
        angewendet.push(name);
      } else if (alt !== pruefsumme(inhalt)) {
        throw new Error(`Migration ${name} wurde nach der Anwendung geändert`);
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock(hashtext($1))", [tabelle]).catch(() => undefined);
    client.release();
  }
  return angewendet;
}

async function ladeBekannte(client: PoolClient, tabelle: string): Promise<Map<string, string>> {
  const r = await client.query<{ name: string; pruefsumme: string }>(
    `select name, pruefsumme from ${tabelle}`,
  );
  return new Map(r.rows.map((z) => [z.name, z.pruefsumme]));
}

async function wendeAn(
  client: PoolClient,
  tabelle: string,
  name: string,
  inhalt: string,
): Promise<void> {
  try {
    await client.query("begin");
    await client.query(inhalt);
    await client.query(`insert into ${tabelle} (name, pruefsumme) values ($1, $2)`, [
      name,
      pruefsumme(inhalt),
    ]);
    await client.query("commit");
  } catch (fehler) {
    await client.query("rollback");
    throw fehler;
  }
}
