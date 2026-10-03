import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mitKonto, migriere, oeffnePool } from "../kern/index.ts";
import { findeOderLegeKonto } from "./index.ts";

// US-ACC-01, FR-ACC-01: Die Kontoanlage läuft über einen eigenen Weg, der nur das Konto des geprüften Subjekts sieht.
let pool: Pool;
const subjektA = `test-${randomUUID()}`;
const subjektB = `test-${randomUUID()}`;

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
});
afterAll(async () => {
  await pool.query("delete from konto where subjekt = any($1)", [[subjektA, subjektB]]);
  await pool.end();
});

describe("Kontoanlage über das Subjekt des Anmeldedienstes (US-ACC-01)", () => {
  it("legt beim ersten Mal ein Konto an und liefert danach dieselbe Kennung", async () => {
    const erste = await findeOderLegeKonto(pool, subjektA);
    const zweite = await findeOderLegeKonto(pool, subjektA);
    expect(erste).toMatch(/^[0-9a-f-]{36}$/);
    expect(zweite).toBe(erste);
  });

  it("zwei gleichzeitige erste Anmeldungen ergeben genau ein Konto", async () => {
    const ids = await Promise.all([1, 2, 3].map(() => findeOderLegeKonto(pool, subjektB)));
    expect(new Set(ids).size).toBe(1);
    const n = await pool.query("select count(*)::int as n from konto where subjekt = $1", [
      subjektB,
    ]);
    expect(n.rows[0].n).toBe(1);
  });

  it("verschiedene Subjekte bekommen verschiedene Konten", async () => {
    const a = await findeOderLegeKonto(pool, subjektA);
    const b = await findeOderLegeKonto(pool, subjektB);
    expect(a).not.toBe(b);
  });

  it("ein leeres Subjekt wird abgewiesen", async () => {
    await expect(findeOderLegeKonto(pool, "")).rejects.toThrow(/Subjekt/);
  });

  it("der Anmeldeweg sieht nie fremde Konten: ohne Subjekt und ohne Konto ist die Tabelle leer", async () => {
    await findeOderLegeKonto(pool, subjektA);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role pflanzendex_app");
      const r = await client.query("select id from konto");
      expect(r.rowCount).toBe(0);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("Kontodaten (E-Mail, Anzeigename) sind nur für das eigene Konto sichtbar (FR-ACC-01)", async () => {
    const a = await findeOderLegeKonto(pool, subjektA);
    const b = await findeOderLegeKonto(pool, subjektB);
    await mitKonto(pool, a, (c) =>
      c.query(
        "insert into kontodaten (konto_id, email, anzeigename) values ($1, 'a@example.test', 'A')",
        [a],
      ),
    );
    const sichtB = await mitKonto(pool, b, (c) => c.query("select * from kontodaten"));
    expect(sichtB.rowCount).toBe(0);
  });
});
