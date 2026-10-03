import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migriere } from "./migrate.ts";
import { oeffnePool } from "./verbindung.ts";

const TABELLE = "schema_migrations_test";
let pool: Pool;

beforeAll(() => {
  pool = oeffnePool();
});
afterAll(async () => {
  await pool.query(`drop table if exists ${TABELLE}`);
  await pool.end();
});

function verzeichnis(dateien: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "migr-"));
  for (const [name, inhalt] of Object.entries(dateien)) writeFileSync(join(dir, name), inhalt);
  return dir;
}

describe("Migrationswerkzeug", () => {
  it("wendet Dateien in Namensreihenfolge einmal an und merkt sich sie", async () => {
    await pool.query(`drop table if exists ${TABELLE}`);
    const dir = verzeichnis({ "0002_b.sql": "select 2;", "0001_a.sql": "select 1;" });
    expect(await migriere(pool, { verzeichnis: dir, tabelle: TABELLE })).toEqual([
      "0001_a.sql",
      "0002_b.sql",
    ]);
    expect(await migriere(pool, { verzeichnis: dir, tabelle: TABELLE })).toEqual([]);
  });

  it("bricht ab, wenn eine bereits angewendete Migration nachträglich geändert wurde", async () => {
    await pool.query(`drop table if exists ${TABELLE}`);
    const dir = verzeichnis({ "0001_a.sql": "select 1;" });
    await migriere(pool, { verzeichnis: dir, tabelle: TABELLE });
    writeFileSync(join(dir, "0001_a.sql"), "select 99;");
    await expect(migriere(pool, { verzeichnis: dir, tabelle: TABELLE })).rejects.toThrow(
      /0001_a\.sql.*geändert/,
    );
  });

  it("rollt eine fehlerhafte Migration vollständig zurück und lässt nichts halb angewendet", async () => {
    await pool.query(`drop table if exists ${TABELLE}`);
    const dir = verzeichnis({
      "0001_kaputt.sql": "create table halb (id int); select nicht_vorhanden();",
    });
    await expect(migriere(pool, { verzeichnis: dir, tabelle: TABELLE })).rejects.toThrow();
    const r = await pool.query("select to_regclass('halb') as t");
    expect(r.rows[0].t).toBeNull();
  });
});
