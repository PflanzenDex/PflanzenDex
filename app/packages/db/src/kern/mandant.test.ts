import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findeSchemaVerstoesse, mitKonto, migriere, pruefeMandantentrennung } from "./index.ts";
import { oeffnePool } from "./verbindung.ts";
import { FIXTURES } from "../fixtures.ts";

// Testrahmen mit zwei Konten (QG-D1, NFR-09, FR-ACC-02). Läuft gegen eine echte PostgreSQL (`make db-up`).
let pool: Pool;
const kontoA = randomUUID();
const kontoB = randomUUID();

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
});
afterAll(async () => {
  await pool.query("delete from konto where id = any($1)", [[kontoA, kontoB]]);
  await pool.end();
});

describe("Mandantentrennung über alle Tabellen", () => {
  it("Konto A liest und ändert nichts von Konto B (und umgekehrt), für jede Tabelle mit Konto-Kennung", async () => {
    const probleme = await pruefeMandantentrennung(pool, FIXTURES, kontoA, kontoB);
    expect(probleme).toEqual([]);
  });

  it("das Schema hat keine Tabelle ohne Konto-Kennung und keine ohne erzwungene Zeilenregel", async () => {
    expect(await findeSchemaVerstoesse(pool)).toEqual([]);
  });

  it("eine neue Tabelle ohne Konto-Kennung fällt auf", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("create table vergessen (id serial primary key, name text)");
      const verstoesse = await findeSchemaVerstoesse(client);
      expect(verstoesse).toEqual([expect.stringContaining("vergessen")]);
      expect(verstoesse[0]).toContain("Konto-Kennung");
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("eine Tabelle mit Konto-Kennung, aber ohne Zeilenregel, fällt auf", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("create table offen (konto_id uuid not null references konto(id))");
      const verstoesse = await findeSchemaVerstoesse(client);
      expect(verstoesse).toEqual([expect.stringContaining("offen")]);
      expect(verstoesse[0]).toContain("Zeilenregel");
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("eine geschützte Tabelle ohne Fixture lässt den generischen Test scheitern", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("create table neu (konto_id uuid not null references konto(id))");
      await client.query("select mandantenschutz('neu')");
      await client.query("commit");
      const probleme = await pruefeMandantentrennung(pool, FIXTURES, kontoA, kontoB);
      expect(probleme).toEqual([expect.stringContaining("neu")]);
    } finally {
      client.release();
      await pool.query("drop table if exists neu");
    }
  });

  it("ein defekter Schutz wird vom generischen Test erkannt (Regel erlaubt Fremdzugriff)", async () => {
    await pool.query("create table leck (konto_id uuid not null references konto(id), wert text)");
    try {
      await pool.query("select mandantenschutz('leck')");
      await pool.query("drop policy mandant on leck");
      await pool.query("create policy mandant on leck using (true) with check (true)");
      const fixtures = { ...FIXTURES, leck: () => ({ wert: "x" }) };
      const probleme = await pruefeMandantentrennung(pool, fixtures, kontoA, kontoB);
      expect(probleme.length).toBeGreaterThan(0);
      expect(probleme.join("\n")).toContain("leck");
    } finally {
      await pool.query("drop table leck");
    }
  });
});

describe("Sitzungsvariable je Transaktion", () => {
  it("ohne Konto in der Sitzung sieht die Anwendung nichts (sicherer Ausgang)", async () => {
    await mitKonto(pool, kontoA, (c) => c.query("insert into konto (id) values ($1)", [kontoA]));
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role pflanzendex_app");
      const r = await client.query("select * from konto");
      expect(r.rowCount).toBe(0);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("die Variable gilt nur in der Transaktion und leckt nicht in die nächste (Pool-Wiederverwendung)", async () => {
    await mitKonto(pool, kontoA, (c) => c.query("select 1"));
    const client = await pool.connect();
    try {
      const r = await client.query("select current_setting('app.konto_id', true) as k");
      expect(r.rows[0].k ?? "").toBe("");
      const rolle = await client.query("select current_user as u");
      expect(rolle.rows[0].u).not.toBe("pflanzendex_app");
    } finally {
      client.release();
    }
  });

  it("lehnt eine Konto-Kennung ab, die keine UUID ist (kein Einschleusen)", async () => {
    await expect(mitKonto(pool, "x'; drop table konto;--", async () => 1)).rejects.toThrow(/UUID/);
  });

  it("bei einem Fehler im Rumpf wird zurückgerollt", async () => {
    await expect(
      mitKonto(pool, kontoB, async (c) => {
        await c.query("insert into konto (id) values ($1)", [kontoB]);
        throw new Error("Abbruch");
      }),
    ).rejects.toThrow("Abbruch");
    const r = await pool.query("select 1 from konto where id = $1", [kontoB]);
    expect(r.rowCount).toBe(0);
  });
});
