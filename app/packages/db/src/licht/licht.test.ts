import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IdempotenzPostgres, migriere, mitKonto, oeffnePool } from "../kern/index.ts";
import { StandortePostgres, ZonenPostgres } from "./index.ts";

// US-LIC-05, FR-LIC-01, P-04: Lichtzonen und Standorte je Konto (echte PostgreSQL, `make db-up`).
let pool: Pool;
let zonen: ZonenPostgres;
let standorte: StandortePostgres;
const anna = randomUUID();
const ben = randomUUID();
const werte = { name: "Lampe 2", luxDecke: 15000, ppfd: 300, reihenfolge: 2 };

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
  zonen = new ZonenPostgres(pool);
  standorte = new StandortePostgres(pool);
  for (const id of [anna, ben])
    await mitKonto(pool, id, (c) => c.query("insert into konto (id) values ($1)", [id]));
});
afterAll(async () => {
  await pool.query("delete from konto where id = any($1)", [[anna, ben]]);
  await pool.end();
});

const angelegt = async (nutzer: string, name: string) => {
  const z = await zonen.anlegen(nutzer, { ...werte, name, reihenfolge: null });
  if (typeof z === "string") throw new Error(z);
  return z;
};

describe("US-LIC-05 Lichtzonen in der Datenbank", () => {
  it("legt Zonen an, sortiert nach Reihenfolge, und hängt ohne Angabe hinten an", async () => {
    await zonen.anlegen(anna, { ...werte, name: "Z-eins", reihenfolge: 7 });
    const z = await zonen.anlegen(anna, {
      ...werte,
      name: "Z-zwei",
      ppfd: null,
      reihenfolge: null,
    });
    expect(z).toMatchObject({ reihenfolge: 8, ppfd: null });
    const namen = (await zonen.liste(anna)).map((x) => x.name);
    expect(namen.indexOf("Z-eins")).toBeLessThan(namen.indexOf("Z-zwei"));
  });

  it("der Name ist je Konto eindeutig (ohne Beachtung der Schreibweise), bei anderen Konten nicht", async () => {
    await angelegt(anna, "Eindeutig");
    expect(await zonen.anlegen(anna, { ...werte, name: "EINDEUTIG" })).toBe("name_vergeben");
    expect(await zonen.anlegen(ben, { ...werte, name: "Eindeutig" })).toMatchObject({
      name: "Eindeutig",
    });
  });

  it("ändert nur Zonen des eigenen Kontos", async () => {
    const z = await angelegt(anna, "Aendern");
    expect(await zonen.aendern(ben, z.id, { ...werte, name: "Fremd" })).toBe("nicht_gefunden");
    const neu = await zonen.aendern(anna, z.id, {
      ...werte,
      name: "Umbenannt",
      luxDecke: 999,
      reihenfolge: null,
    });
    expect(neu).toMatchObject({
      id: z.id,
      name: "Umbenannt",
      luxDecke: 999,
      reihenfolge: z.reihenfolge,
    });
  });

  it("verweigert Werte außerhalb der Grenzen schon in der Datenbank", async () => {
    await expect(zonen.anlegen(anna, { ...werte, name: "Zu hell", luxDecke: 0 })).rejects.toThrow();
  });
});

describe("US-LIC-05 Standorte in der Datenbank", () => {
  it("legt Standorte mit und ohne Zone an; beliebig viele je Zone", async () => {
    const z = await angelegt(anna, "Mehrere");
    for (const name of ["S1", "S2", "S3"])
      expect(
        await standorte.anlegen(anna, { name, lichtzoneId: z.id, art: "innen" }),
      ).toMatchObject({ lichtzoneId: z.id });
    expect(
      await standorte.anlegen(anna, { name: "Ohne", lichtzoneId: null, art: "aussen" }),
    ).toMatchObject({ lichtzoneId: null });
  });

  it("der Name ist je Konto eindeutig", async () => {
    await standorte.anlegen(anna, { name: "Fensterbank", lichtzoneId: null, art: "innen" });
    expect(
      await standorte.anlegen(anna, { name: "fensterbank", lichtzoneId: null, art: "innen" }),
    ).toBe("name_vergeben");
    expect(
      await standorte.anlegen(ben, { name: "Fensterbank", lichtzoneId: null, art: "innen" }),
    ).toMatchObject({ name: "Fensterbank" });
  });

  it("die Zone eines anderen Kontos lässt sich nicht zuordnen (zusammengesetzter Fremdschlüssel)", async () => {
    const fremd = await angelegt(ben, "Bens Zone");
    expect(
      await standorte.anlegen(anna, { name: "Klau", lichtzoneId: fremd.id, art: "innen" }),
    ).toBe("zone_unbekannt");
    const eigen = await standorte.anlegen(anna, { name: "Eigen", lichtzoneId: null, art: "innen" });
    if (typeof eigen === "string") throw new Error(eigen);
    expect(
      await standorte.aendern(anna, eigen.id, {
        name: "Eigen",
        lichtzoneId: fremd.id,
        art: "innen",
      }),
    ).toBe("zone_unbekannt");
  });

  it("Umbenennen der Zone ändert die Zuordnung nicht (Kennung)", async () => {
    const z = await angelegt(anna, "Vorher");
    const s = await standorte.anlegen(anna, {
      name: "Zugeordnet",
      lichtzoneId: z.id,
      art: "innen",
    });
    await zonen.aendern(anna, z.id, { ...werte, name: "Nachher" });
    const liste = await standorte.liste(anna);
    expect(liste.find((x) => typeof s !== "string" && x.id === s.id)?.lichtzoneId).toBe(z.id);
  });

  it("nennt die Standorte einer Zone als Nutzer; fremde Konten sehen nichts", async () => {
    const z = await angelegt(anna, "Genutzt");
    await standorte.anlegen(anna, { name: "Nutzer-Standort", lichtzoneId: z.id, art: "innen" });
    expect(await standorte.nutzer(anna, z.id)).toEqual([
      { art: "standort", id: expect.any(String), name: "Nutzer-Standort" },
    ]);
    expect(await standorte.nutzer(ben, z.id)).toEqual([]);
  });

  it("eine Zone mit Standorten lässt sich nicht löschen (Fremdschlüssel als Rückfall), eine freie schon", async () => {
    const z = await angelegt(anna, "Belegt");
    await standorte.anlegen(anna, { name: "Belegt-Standort", lichtzoneId: z.id, art: "innen" });
    expect(await zonen.loeschen(anna, z.id)).toBe("in_benutzung");
    const frei = await angelegt(anna, "Frei");
    expect(await zonen.loeschen(ben, frei.id)).toBe("nicht_gefunden");
    expect(await zonen.loeschen(anna, frei.id)).toBe("geloescht");
  });
});

describe("Wiederholungsschutz in der Datenbank", () => {
  const s = (nutzerId: string, schluessel = "k1") => ({ nutzerId, operation: "t.t", schluessel });

  it("zwei gleichzeitige Aufrufe mit demselben Schlüssel: genau einer ist neu", async () => {
    const idem = new IdempotenzPostgres(pool);
    const schluessel = randomUUID();
    const r = await Promise.all([1, 2, 3].map(() => idem.beginne(s(anna, schluessel), "{}")));
    expect(r.filter((x) => x.art === "neu")).toHaveLength(1);
  });

  it("liefert nach dem Abschluss das gespeicherte Ergebnis, bei anderer Eingabe einen Konflikt", async () => {
    const idem = new IdempotenzPostgres(pool);
    const schluessel = randomUUID();
    await idem.beginne(s(anna, schluessel), "a");
    await idem.schliesse(s(anna, schluessel), { id: 1 });
    expect(await idem.beginne(s(anna, schluessel), "a")).toEqual({
      art: "wiederholung",
      ergebnis: { id: 1 },
    });
    expect(await idem.beginne(s(anna, schluessel), "b")).toEqual({ art: "konflikt" });
  });

  it("verworfene Schlüssel sind wieder frei; derselbe Schlüssel zweier Konten ist getrennt", async () => {
    const idem = new IdempotenzPostgres(pool);
    const schluessel = randomUUID();
    await idem.beginne(s(anna, schluessel), "a");
    expect((await idem.beginne(s(ben, schluessel), "a")).art).toBe("neu");
    await idem.verwerfe(s(anna, schluessel));
    expect((await idem.beginne(s(anna, schluessel), "a")).art).toBe("neu");
  });
});
