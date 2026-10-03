import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExemplarePostgres } from "../bestand/index.ts";
import { legeFixtureArtAn } from "../fixtures.ts";
import { migriere, mitKonto, oeffnePool } from "../kern/index.ts";
import { MessungenPostgres } from "./index.ts";

// US-WAC-01, DM-WAC-01, P-04: Messungen je Konto (echte PostgreSQL, `make db-up`).
let pool: Pool;
let messungen: MessungenPostgres;
const anna = randomUUID();
const ben = randomUUID();
let exemplarAnna = "";
let exemplarBen = "";
let art = "";
const werte = (extra: Record<string, unknown> = {}) => ({
  exemplarId: exemplarAnna,
  datum: "2026-10-03",
  wert: 12.5,
  qualitaet: "gesund" as const,
  notiz: null,
  bewertungDurch: "halter" as const,
  ...extra,
});

async function exemplar(konto: string, name: string): Promise<string> {
  const z = await new ExemplarePostgres(pool).anlegen(konto, {
    artId: art,
    name,
    kennzeichen: null,
    standortId: null,
    gefangenAm: null,
  });
  if (typeof z === "string") throw new Error(z);
  return z.id;
}

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
  art = await legeFixtureArtAn(pool);
  messungen = new MessungenPostgres(pool);
  for (const id of [anna, ben])
    await mitKonto(pool, id, (c) => c.query("insert into konto (id) values ($1)", [id]));
  exemplarAnna = await exemplar(anna, "Anna Pflanze");
  exemplarBen = await exemplar(ben, "Ben Pflanze");
});
afterAll(async () => {
  await pool.query("delete from konto where id = any($1)", [[anna, ben]]);
  await pool.end();
});

describe("US-WAC-01 Messungen in der Datenbank", () => {
  it("speichert und liest Zahl, Qualität, Notiz und Datum zurück", async () => {
    const z = await messungen.anlegen(
      anna,
      werte({ wert: 14.5, qualitaet: "vergeilt", notiz: "gestreckt" }),
    );
    expect(z).toMatchObject({
      exemplarId: exemplarAnna,
      datum: "2026-10-03",
      wert: 14.5,
      qualitaet: "vergeilt",
      notiz: "gestreckt",
      bewertungDurch: "halter",
    });
    expect(await messungen.liste(anna, exemplarAnna)).toContainEqual(z);
  });

  it("das Datum bleibt das gespeicherte Kalenderdatum, unabhängig von der Zeitzone des Servers (NFR-08)", async () => {
    const vorher = process.env["TZ"];
    process.env["TZ"] = "Pacific/Kiritimati";
    try {
      const z = await messungen.anlegen(anna, werte({ datum: "2026-01-01" }));
      expect(z).toMatchObject({ datum: "2026-01-01" });
      expect(await messungen.liste(anna, exemplarAnna)).toContainEqual(z);
    } finally {
      if (vorher === undefined) delete process.env["TZ"];
      else process.env["TZ"] = vorher;
    }
  });

  it("liefert neueste zuerst: nach Datum, bei gleichem Datum die zuletzt erfasste", async () => {
    const ex = await exemplar(anna, "Reihenfolge");
    await messungen.anlegen(anna, werte({ exemplarId: ex, datum: "2026-09-01", wert: 10 }));
    await messungen.anlegen(anna, werte({ exemplarId: ex, datum: "2026-10-01", wert: 20 }));
    await messungen.anlegen(anna, werte({ exemplarId: ex, datum: "2026-10-01", wert: 21 }));
    expect((await messungen.liste(anna, ex)).map((m) => m.wert)).toEqual([21, 20, 10]);
  });

  it("ein Konto legt keine Messung an einem fremden Exemplar an und sieht keine fremden (P-04)", async () => {
    expect(await messungen.anlegen(anna, werte({ exemplarId: exemplarBen }))).toBe(
      "exemplar_unbekannt",
    );
    expect(await messungen.anlegen(ben, werte({ exemplarId: exemplarBen }))).toMatchObject({
      exemplarId: exemplarBen,
    });
    expect(await messungen.liste(anna, exemplarBen)).toEqual([]);
    expect(await messungen.liste(ben, exemplarAnna)).toEqual([]);
  });

  it("Werte außerhalb der Grenzen scheitern schon in der Datenbank", async () => {
    for (const extra of [{ wert: -0.5 }, { wert: 10_001 }, { qualitaet: "super" }, { notiz: "" }])
      await expect(messungen.anlegen(anna, werte(extra))).rejects.toThrow();
  });

  it("das Löschen des Kontos nimmt seine Messungen mit", async () => {
    const konto = randomUUID();
    await mitKonto(pool, konto, (c) => c.query("insert into konto (id) values ($1)", [konto]));
    const ex = await exemplar(konto, "Weg");
    await messungen.anlegen(konto, werte({ exemplarId: ex }));
    await pool.query("delete from konto where id = $1", [konto]);
    const r = await pool.query("select 1 from messung where exemplar_id = $1", [ex]);
    expect(r.rowCount).toBe(0);
  });
});
