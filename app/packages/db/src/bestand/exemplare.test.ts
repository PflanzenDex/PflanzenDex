import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migriere, mitKonto, oeffnePool } from "../kern/index.ts";
import { StandortePostgres } from "../licht/index.ts";
import { ExemplarePostgres } from "./index.ts";

// US-BES-02, DM-BES-02, P-04: Exemplare je Konto (echte PostgreSQL, `make db-up`).
let pool: Pool;
let exemplare: ExemplarePostgres;
let standorte: StandortePostgres;
const anna = randomUUID();
const ben = randomUUID();
const art = randomUUID();
const werte = {
  artId: art,
  name: "Bogenhanf",
  kennzeichen: null,
  standortId: null,
  gefangenAm: "2026-10-03",
};

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
  exemplare = new ExemplarePostgres(pool);
  standorte = new StandortePostgres(pool);
  for (const id of [anna, ben])
    await mitKonto(pool, id, (c) => c.query("insert into konto (id) values ($1)", [id]));
});
afterAll(async () => {
  await pool.query("delete from konto where id = any($1)", [[anna, ben]]);
  await pool.end();
});

const standort = async (konto: string, name: string) => {
  const s = await standorte.anlegen(konto, { name, lichtzoneId: null, art: "innen" });
  if (typeof s === "string") throw new Error(s);
  return s;
};

describe("US-BES-02 Exemplare in der Datenbank", () => {
  it("legt ein Exemplar mit Vorbelegung an und liest es wieder; Status ist Pflanze", async () => {
    const z = await exemplare.anlegen(anna, { ...werte, name: "Anlegen" });
    expect(z).toMatchObject({ name: "Anlegen", artId: art, status: "pflanze", standortId: null });
    expect(typeof z === "object" && (await exemplare.finde(anna, z.id))).toEqual(z);
  });

  it("Gefangen_Am bleibt das gespeicherte Kalenderdatum, unabhängig von Zeitzone des Servers (NFR-08)", async () => {
    const vorher = process.env["TZ"];
    process.env["TZ"] = "Pacific/Kiritimati";
    try {
      const z = await exemplare.anlegen(anna, {
        ...werte,
        name: "Datum",
        gefangenAm: "2026-01-01",
      });
      expect(z).toMatchObject({ gefangenAm: "2026-01-01" });
      const id = typeof z === "object" ? z.id : "";
      expect(await exemplare.finde(anna, id)).toMatchObject({ gefangenAm: "2026-01-01" });
    } finally {
      if (vorher === undefined) delete process.env["TZ"];
      else process.env["TZ"] = vorher;
    }
  });

  it("der Name ist je Konto eindeutig (ohne Beachtung der Schreibweise), bei anderen Konten nicht", async () => {
    await exemplare.anlegen(anna, { ...werte, name: "Eindeutig" });
    expect(await exemplare.anlegen(anna, { ...werte, name: "EINDEUTIG" })).toBe("name_vergeben");
    expect(await exemplare.anlegen(ben, { ...werte, name: "Eindeutig" })).toMatchObject({
      name: "Eindeutig",
    });
  });

  it("ein Standort des eigenen Kontos ist erlaubt, der eines anderen Kontos nicht (Fremdschlüssel (konto_id, id))", async () => {
    const eigen = await standort(anna, "Regal Anna");
    const fremd = await standort(ben, "Regal Ben");
    expect(
      await exemplare.anlegen(anna, { ...werte, name: "Mit Standort", standortId: eigen.id }),
    ).toMatchObject({ standortId: eigen.id });
    expect(
      await exemplare.anlegen(anna, { ...werte, name: "Fremder Standort", standortId: fremd.id }),
    ).toBe("standort_unbekannt");
    expect((await exemplare.liste(anna)).map((z) => z.name)).not.toContain("Fremder Standort");
  });

  it("ein Konto sieht und lädt nur seine eigenen Exemplare (P-04)", async () => {
    const z = await exemplare.anlegen(anna, { ...werte, name: "Nur Anna" });
    const id = typeof z === "object" ? z.id : "";
    expect(await exemplare.finde(ben, id)).toBeNull();
    expect((await exemplare.liste(ben)).map((x) => x.id)).not.toContain(id);
  });

  it("Werte außerhalb der Grenzen und ein unbekannter Status scheitern schon in der Datenbank", async () => {
    await expect(exemplare.anlegen(anna, { ...werte, name: "" })).rejects.toThrow();
    await expect(
      mitKonto(pool, anna, (c) =>
        c.query(
          "insert into exemplar (konto_id, art_id, name, status) values ($1, $2, 'S', 'tot')",
          [anna, art],
        ),
      ),
    ).rejects.toThrow();
  });
});
