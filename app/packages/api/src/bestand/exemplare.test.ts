import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migriere, oeffnePool } from "@pflanzendex/db";
import { createApp, type AppOptionen } from "../app";

type TokenPruefer = NonNullable<AppOptionen["pruefer"]>;

// US-BES-02: Exemplar anlegen und ansehen über die API (echte PostgreSQL, `make db-up`).
let pool: Pool;
const lauf = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `bes2-${randomUUID()}`;
const subB = `bes2-${randomUUID()}`;
const pruefer: TokenPruefer = async (token) => {
  const [art, sub] = token.split(":");
  return art === "gueltig"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
// 2026-10-02 23:30 UTC: in Berlin schon der 3. Oktober (NFR-08).
const JETZT = new Date("2026-10-02T23:30:00Z");
let app: ReturnType<typeof createApp>;
type Antwort = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function rufe(
  sub: string | null,
  methode: string,
  pfad: string,
  body?: unknown,
  schluessel: string | null = randomUUID(),
): Promise<Antwort> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer gueltig:${sub}`;
  if (schluessel) headers["idempotency-key"] = schluessel;
  const res = await app.request(pfad, {
    method: methode,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const artProfil = (name: string, deutsch: string) => ({
  lateinischerName: name,
  deutscherName: deutsch,
  schwierigkeit: 2,
  standardStufe: 3,
  lichtbedarfLux: 40000,
  wachstumsmass: "rosettendurchmesser",
  vergeilungAnzeichen: "Rosette streckt sich.",
  erfolgskriterien: "Dichte, flache Rosette.",
});
const neueArt = async (sub: string, name: string, deutsch: string) =>
  (await rufe(sub, "POST", "/arten", artProfil(name, deutsch))).body["id"] as string;
const anlegen = (sub: string, eingabe: Record<string, unknown>, schluessel?: string) =>
  rufe(sub, "POST", "/exemplare", { zeitzone: "Europe/Berlin", ...eingabe }, schluessel);

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
  app = createApp({ pruefer, pool, uhr: () => JETZT });
});
afterAll(async () => {
  await pool.query(
    `delete from art where id in (select objekt_id from pruefvorgang
       where konto_id in (select id from konto where subjekt = any($1)))`,
    [[subA, subB]],
  );
  await pool.query("delete from konto where subjekt = any($1)", [[subA, subB]]);
  await pool.end();
});

describe("US-BES-02 Anmeldung und Eingabe", () => {
  it.each([
    ["GET", "/exemplare"],
    ["GET", "/exemplare/00000000-0000-4000-8000-000000000001"],
    ["POST", "/exemplare"],
  ])("%s %s ohne Token: 401", async (methode, pfad) => {
    expect((await rufe(null, methode, pfad, methode === "POST" ? {} : undefined)).status).toBe(401);
  });

  it("ohne Idempotency-Key: 400 mit stabilem Fehlercode", async () => {
    const r = await rufe(
      subA,
      "POST",
      "/exemplare",
      { artId: randomUUID(), zeitzone: "UTC" },
      null,
    );
    expect(r).toMatchObject({
      status: 400,
      body: { fehler: { code: "idempotenz.schluessel_fehlt" } },
    });
  });

  it("ohne Art und Zeitzone: 400 mit den betroffenen Feldern, nichts geschrieben", async () => {
    const r = await rufe(subA, "POST", "/exemplare", {});
    expect(r.status).toBe(400);
    expect(r.body["fehler"].code).toBe("eingabe.ungueltig");
    expect(r.body["fehler"].details.map((d: { feld: string }) => d.feld)).toEqual([
      "artId",
      "zeitzone",
    ]);
    expect((await rufe(subA, "GET", "/exemplare")).body["exemplare"]).toEqual([]);
  });

  it("eine unbekannte Art: 404 art.nicht_gefunden", async () => {
    const r = await anlegen(subA, { artId: randomUUID() });
    expect(r).toMatchObject({ status: 404, body: { fehler: { code: "art.nicht_gefunden" } } });
  });
});

describe("US-BES-02 Exemplar anlegen und ansehen", () => {
  it("Pflicht ist die Art: 201 mit Name nach Namensregel, lokalem Gefangen_Am und leeren Listen", async () => {
    const artId = await neueArt(subA, `Aloe${lauf} vera`, `Aloe ${lauf}`);
    const r = await anlegen(subA, { artId });
    expect(r).toMatchObject({
      status: 201,
      body: {
        artId,
        name: `Aloe ${lauf}`,
        kennzeichen: null,
        status: "pflanze",
        gefangenAm: "2026-10-03",
        standortId: null,
        messreihe: [],
        behandlungen: [],
      },
    });
    const geladen = await rufe(subA, "GET", `/exemplare/${r.body["id"]}`);
    expect(geladen).toMatchObject({
      status: 200,
      body: { id: r.body["id"], name: `Aloe ${lauf}` },
    });
  });

  it("dieselbe Zeit ist in New York noch der Vortag: Gefangen_Am folgt der Zeitzone des Nutzers (FR-BES-04)", async () => {
    const artId = await neueArt(subA, `Agave${lauf} utah`, `Agave ${lauf}`);
    const r = await rufe(subA, "POST", "/exemplare", { artId, zeitzone: "America/New_York" });
    expect(r).toMatchObject({ status: 201, body: { gefangenAm: "2026-10-02" } });
  });

  it("existiert der Name, ist die Antwort 409 und nichts ändert sich; mit Kennzeichen entsteht „Art – Kennzeichen“", async () => {
    const artId = await neueArt(subA, `Yucca${lauf} rostrata`, `Yucca ${lauf}`);
    const erst = await anlegen(subA, { artId });
    const doppelt = await anlegen(subA, { artId });
    expect(doppelt).toMatchObject({
      status: 409,
      body: { fehler: { code: "exemplar.name_vergeben" } },
    });
    expect(doppelt.body["fehler"].daten.vorhandene).toEqual([
      { id: erst.body["id"], name: `Yucca ${lauf}` },
    ]);
    const mit = await anlegen(subA, { artId, kennzeichen: "rot" });
    expect(mit).toMatchObject({ status: 201, body: { name: `Yucca ${lauf} – rot` } });
    const namen = (await rufe(subA, "GET", "/exemplare")).body["exemplare"].map(
      (e: { name: string }) => e.name,
    );
    expect(namen.filter((n: string) => n.startsWith(`Yucca ${lauf}`))).toHaveLength(2);
  });

  it("ein eigener Standort wird übernommen, der eines anderen Kontos abgelehnt (404 standort.nicht_gefunden)", async () => {
    const artId = await neueArt(subA, `Ficus${lauf} elastica`, `Ficus ${lauf}`);
    const eigen = await rufe(subA, "POST", "/standorte", { name: `Regal ${lauf}`, art: "innen" });
    const fremd = await rufe(subB, "POST", "/standorte", { name: `Regal ${lauf}`, art: "innen" });
    const fremdAbgelehnt = await anlegen(subA, { artId, standortId: fremd.body["id"] });
    expect(fremdAbgelehnt).toMatchObject({
      status: 404,
      body: { fehler: { code: "standort.nicht_gefunden" } },
    });
    const ok = await anlegen(subA, { artId, standortId: eigen.body["id"] });
    expect(ok).toMatchObject({ status: 201, body: { standortId: eigen.body["id"] } });
  });

  it("der private Vorschlag eines anderen Kontos ist keine wählbare Art (P-04)", async () => {
    const artId = await neueArt(subB, `Sedum${lauf} morganianum`, `Sedum ${lauf}`);
    const r = await anlegen(subA, { artId });
    expect(r).toMatchObject({ status: 404, body: { fehler: { code: "art.nicht_gefunden" } } });
  });

  it("ein Konto sieht und lädt keine fremden Exemplare: Liste ohne sie, Einzelabruf 404", async () => {
    const artId = await neueArt(subB, `Opuntia${lauf} ficus`, `Opuntia ${lauf}`);
    const bens = await anlegen(subB, { artId });
    const liste = await rufe(subA, "GET", "/exemplare");
    expect(liste.body["exemplare"].map((e: { id: string }) => e.id)).not.toContain(bens.body["id"]);
    expect(await rufe(subA, "GET", `/exemplare/${bens.body["id"]}`)).toMatchObject({
      status: 404,
      body: { fehler: { code: "exemplar.nicht_gefunden" } },
    });
  });

  it("gleicher Wiederholungsschutz-Schlüssel: kein zweites Exemplar, dieselbe Antwort", async () => {
    const artId = await neueArt(subA, `Sansevieria${lauf} cylindrica`, `Sanse ${lauf}`);
    const schluessel = randomUUID();
    const a = await anlegen(subA, { artId }, schluessel);
    const b = await anlegen(subA, { artId }, schluessel);
    expect(b).toMatchObject({ status: 201, body: { id: a.body["id"] } });
  });

  it("ungültige Kennung beim Einzelabruf: 404 statt Serverfehler", async () => {
    expect((await rufe(subA, "GET", "/exemplare/kein-uuid")).status).toBe(404);
  });
});
