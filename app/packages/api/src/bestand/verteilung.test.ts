import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migriere, oeffnePool } from "@pflanzendex/db";
import { createApp, type AppOptionen } from "../app";

type TokenPruefer = NonNullable<AppOptionen["pruefer"]>;

// US-LIC-02: Verteilung der Exemplare auf die Lichtzonen über die API (echte PostgreSQL, `make db-up`).
let pool: Pool;
const lauf = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `lic2-${randomUUID()}`;
const subB = `lic2-${randomUUID()}`;
const pruefer: TokenPruefer = async (token) => {
  const [art, sub] = token.split(":");
  return art === "gueltig"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
type Antwort = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
let app: ReturnType<typeof createApp>;

async function rufe(
  sub: string | null,
  methode: string,
  pfad: string,
  body?: unknown,
): Promise<Antwort> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer gueltig:${sub}`;
  if (methode !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await app.request(pfad, {
    method: methode,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const verteilung = (sub: string | null) => rufe(sub, "GET", "/exemplare/verteilung");

const neueArt = async (sub: string, name: string, lux: number, stufe: number) =>
  (
    await rufe(sub, "POST", "/arten", {
      lateinischerName: name,
      deutscherName: name,
      schwierigkeit: 2,
      standardStufe: stufe,
      lichtbedarfLux: lux,
      wachstumsmass: "rosettendurchmesser",
      vergeilungAnzeichen: "Rosette streckt sich.",
      erfolgskriterien: "Dichte, flache Rosette.",
    })
  ).body["id"] as string;
const voreinstellung = async (sub: string) => {
  const r = await rufe(sub, "POST", "/lichtzonen/voreinstellung", {});
  return Object.fromEntries(
    (r.body["zonen"] as { id: string; name: string }[]).map((z) => [z.name, z.id]),
  );
};
const standort = async (sub: string, name: string, lichtzoneId: string | null) =>
  (await rufe(sub, "POST", "/standorte", { name, art: "innen", lichtzoneId })).body["id"] as string;
const exemplar = async (sub: string, name: string, artId: string, standortId?: string) =>
  (
    await rufe(sub, "POST", "/exemplare", {
      zeitzone: "Europe/Berlin",
      artId,
      name,
      ...(standortId ? { standortId } : {}),
    })
  ).body["id"] as string;
const zahlen = (r: Antwort) =>
  (r.body["verteilung"].zonen as { zone: { name: string }; anzahl: number }[]).map((z) => [
    z.zone.name,
    z.anzahl,
  ]);

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
  app = createApp({ pruefer, pool });
});
afterAll(async () => {
  await pool.query(
    "delete from exemplar where konto_id in (select id from konto where subjekt = any($1))",
    [[subA, subB]],
  );
  await pool.query(
    `delete from art where id in (select objekt_id from pruefvorgang
       where konto_id in (select id from konto where subjekt = any($1)))`,
    [[subA, subB]],
  );
  await pool.query("delete from konto where subjekt = any($1)", [[subA, subB]]);
  await pool.end();
});

describe("US-LIC-02 Verteilung: Anmeldung", () => {
  it("GET /exemplare/verteilung ohne Token: 401", async () => {
    expect((await verteilung(null)).status).toBe(401);
  });

  it("die Route „verteilung“ wird nicht als Kennung eines Exemplars gelesen", async () => {
    expect((await verteilung(subA)).status).toBe(200);
  });
});

describe("US-LIC-02 Verteilung: Zählung und dünnste Zone", () => {
  it("zählt je Zone 2 bis 4, nennt die dünnste Zone mit nächster Handlung und lässt Stecklingslicht aus", async () => {
    const zone = await voreinstellung(subA);
    const fenster = await standort(subA, `Fenster ${lauf}`, zone["Lampe 2"] ?? null);
    const regal = await standort(subA, `Regal ${lauf}`, zone["Lampe 3"] ?? null);
    const ecke = await standort(subA, `Ecke ${lauf}`, zone["Lampe 1"] ?? null);
    const niedrig = await neueArt(subA, `Aloe${lauf} vera`, 15000, 2);
    await exemplar(subA, `A1 ${lauf}`, niedrig, fenster);
    await exemplar(subA, `A2 ${lauf}`, niedrig, fenster);
    await exemplar(subA, `A3 ${lauf}`, niedrig, regal);
    await exemplar(subA, `A4 ${lauf}`, niedrig, ecke);
    const r = await verteilung(subA);
    expect(r.status).toBe(200);
    expect(zahlen(r)).toEqual([
      ["Lampe 2", 2],
      ["Lampe 3", 1],
      ["Lampe 4", 0],
    ]);
    expect(r.body["verteilung"].duennste.map((z: { name: string }) => z.name)).toEqual(["Lampe 4"]);
    expect(r.body["verteilung"].nichtGezaehlt.stecklingslicht).toBe(1);
    expect(r.body["verteilung"].hinweis.naechsteHandlung).not.toBe("");
  });

  it("ein Exemplar ohne Standort-Zone nimmt die aus dem Lux-Bedarf abgeleitete Zone der Art", async () => {
    const art = await neueArt(subA, `Agave${lauf} utah`, 40000, 3);
    await exemplar(subA, `Ohne Zone ${lauf}`, art);
    const r = await verteilung(subA);
    expect(zahlen(r)).toEqual([
      ["Lampe 2", 2],
      ["Lampe 3", 2],
      ["Lampe 4", 0],
    ]);
  });

  it("Status Steckling und archiviert werden nicht gezählt, aber ausgewiesen", async () => {
    await pool.query(
      `update exemplar set status = 'steckling'
        where konto_id = (select id from konto where subjekt = $1) and name = $2`,
      [subA, `A1 ${lauf}`],
    );
    await pool.query(
      `update exemplar set status = 'archiviert'
        where konto_id = (select id from konto where subjekt = $1) and name = $2`,
      [subA, `A3 ${lauf}`],
    );
    const r = await verteilung(subA);
    expect(zahlen(r)).toEqual([
      ["Lampe 2", 1],
      ["Lampe 3", 1],
      ["Lampe 4", 0],
    ]);
    expect(r.body["verteilung"].nichtGezaehlt).toMatchObject({
      stecklingslicht: 2,
      archiviert: 1,
    });
  });
});

describe("US-LIC-02 Verteilung: Mandant", () => {
  it("ein Konto sieht nur die Verteilung seiner eigenen Exemplare und Zonen, nie fremde Namen", async () => {
    const zone = await voreinstellung(subB);
    const dach = await standort(subB, `Dach ${lauf}`, zone["Lampe 4"] ?? null);
    const art = await neueArt(subB, `Opuntia${lauf} ficus`, 110000, 4);
    await exemplar(subB, `Bens Kaktus ${lauf}`, art, dach);
    const fuerBen = await verteilung(subB);
    expect(zahlen(fuerBen)).toEqual([
      ["Lampe 2", 0],
      ["Lampe 3", 0],
      ["Lampe 4", 1],
    ]);
    const fuerAnna = await verteilung(subA);
    expect(JSON.stringify(fuerAnna.body)).not.toContain(`Dach ${lauf}`);
    expect(JSON.stringify(fuerAnna.body)).not.toContain("Bens Kaktus");
    expect(zahlen(fuerAnna)[2]).toEqual(["Lampe 4", 0]);
  });

  it("ein Konto ohne Zonen bekommt eine leere Verteilung und den Hinweis, Lichtzonen anzulegen", async () => {
    const r = await verteilung(`lic2-${randomUUID()}`);
    expect(r.status).toBe(200);
    expect(r.body["verteilung"].zonen).toEqual([]);
    expect(r.body["verteilung"].hinweis.naechsteHandlung).toContain("Lichtzone");
  });
});
