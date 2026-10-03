import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { heuteLokal } from "@pflanzendex/core";
import { migriere, oeffnePool } from "@pflanzendex/db";
import { createApp, type AppOptionen } from "../app";

type TokenPruefer = NonNullable<AppOptionen["pruefer"]>;

// US-WAC-01: Messung erfassen und Ansicht „Messen“ über die API (echte PostgreSQL, `make db-up`).
let pool: Pool;
const lauf = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `wac1-${randomUUID()}`;
const subB = `wac1-${randomUUID()}`;
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

let zaehler = 0;
const neuesExemplar = async (sub: string, name: string): Promise<string> => {
  const art = await rufe(sub, "POST", "/arten", {
    lateinischerName: `${name}${lauf} test`,
    deutscherName: `${name} ${lauf}`,
    schwierigkeit: 2,
    standardStufe: 3,
    lichtbedarfLux: 40000,
    wachstumsmass: "rosettendurchmesser",
    vergeilungAnzeichen: "Rosette streckt sich.",
    erfolgskriterien: "Dichte, flache Rosette.",
  });
  const e = await rufe(sub, "POST", "/exemplare", {
    artId: art.body["id"],
    zeitzone: "Europe/Berlin",
  });
  return e.body["id"] as string;
};
const messe = (
  sub: string,
  id: string,
  eingabe: Record<string, unknown>,
  schluessel?: string | null,
) =>
  rufe(
    sub,
    "POST",
    `/exemplare/${id}/messungen`,
    { zeitzone: "Europe/Berlin", ...eingabe },
    schluessel,
  );

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
  app = createApp({ pruefer, pool, uhr: () => JETZT });
});
afterAll(async () => {
  // Erst die Exemplare (mit ihren Messungen): der Verweis auf die Art ist on delete restrict (AB-10).
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

describe("US-WAC-01 Anmeldung und Eingabe", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it.each([
    ["GET", `/exemplare/${id}/messungen`],
    ["POST", `/exemplare/${id}/messungen`],
  ])("%s %s ohne Token: 401", async (methode, pfad) => {
    expect((await rufe(null, methode, pfad, methode === "POST" ? {} : undefined)).status).toBe(401);
  });

  it("ohne Idempotency-Key: 400 mit stabilem Fehlercode, nichts geschrieben", async () => {
    const e = await neuesExemplar(subA, "Schluessel");
    const r = await messe(subA, e, { wert: 10 }, null);
    expect(r).toMatchObject({
      status: 400,
      body: { fehler: { code: "idempotenz.schluessel_fehlt" } },
    });
    expect((await rufe(subA, "GET", `/exemplare/${e}/messungen`)).body["messungen"]).toEqual([]);
  });

  it.each([
    ["Text", { wert: "zwölf" }, "wert"],
    ["negativ", { wert: -1 }, "wert"],
    ["fehlt", {}, "wert"],
    ["falsches Datum", { wert: 10, datum: "2026-02-30" }, "datum"],
    ["Zukunft", { wert: 10, datum: "2026-10-04" }, "datum"],
    ["Qualität", { wert: 10, qualitaet: "super" }, "qualitaet"],
  ])("ungültige Eingabe (%s): 400 mit Feld, nichts geschrieben", async (_, eingabe, feld) => {
    const e = await neuesExemplar(subA, `Eingabe${feld}${"abcdefgh"[zaehler++]}`);
    const r = await messe(subA, e, eingabe);
    expect(r).toMatchObject({ status: 400, body: { fehler: { code: "eingabe.ungueltig" } } });
    expect(r.body["fehler"].details.map((d: { feld: string }) => d.feld)).toEqual([feld]);
    expect((await rufe(subA, "GET", `/exemplare/${e}/messungen`)).body["messungen"]).toEqual([]);
  });
});

describe("US-WAC-01 Messung erfassen und ansehen", () => {
  it("ein Exemplar ohne Messung: Was messen?, letzte Messung und Bewertung leer", async () => {
    const e = await neuesExemplar(subA, "Leer");
    expect(await rufe(subA, "GET", `/exemplare/${e}/messungen`)).toMatchObject({
      status: 200,
      body: {
        exemplarId: e,
        wachstumsmass: "rosettendurchmesser",
        messungen: [],
        letzte: null,
        letzteBewertung: null,
      },
    });
  });

  it("201 mit Datum heute (lokal) und Qualität gesund; die Ansicht zeigt letzte Messung und Bewertung", async () => {
    const e = await neuesExemplar(subA, "Erfassen");
    const r = await messe(subA, e, { wert: 12.5, notiz: "erste" });
    expect(r).toMatchObject({
      status: 201,
      body: { exemplarId: e, datum: "2026-10-03", wert: 12.5, qualitaet: "gesund", notiz: "erste" },
    });
    await messe(subA, e, { wert: 14, datum: "2026-09-01", qualitaet: "vergeilt" });
    const a = await rufe(subA, "GET", `/exemplare/${e}/messungen`);
    expect(a.body["letzte"]).toMatchObject({ datum: "2026-10-03", wert: 12.5 });
    expect(a.body["letzteBewertung"]).toBe("gesund");
    expect(a.body["messungen"].map((m: { wert: number }) => m.wert)).toEqual([12.5, 14]);
  });

  it("dieselbe Zeit ist in New York noch der Vortag; ein nachgetragenes Datum bleibt erhalten", async () => {
    const e = await neuesExemplar(subA, "Zeitzone");
    const ny = await messe(subA, e, { wert: 5, zeitzone: "America/New_York" });
    const alt = await messe(subA, e, { wert: 4, datum: "2026-01-02" });
    expect(ny.body["datum"]).toBe("2026-10-02");
    expect(alt.body["datum"]).toBe("2026-01-02");
  });

  it("gleicher Wiederholungsschutz-Schlüssel: keine zweite Messung, dieselbe Antwort (US-QS-03)", async () => {
    const e = await neuesExemplar(subA, "Idem");
    const schluessel = randomUUID();
    const a = await messe(subA, e, { wert: 9 }, schluessel);
    const b = await messe(subA, e, { wert: 9 }, schluessel);
    expect(b).toMatchObject({ status: 201, body: { id: a.body["id"] } });
    expect((await rufe(subA, "GET", `/exemplare/${e}/messungen`)).body["messungen"]).toHaveLength(
      1,
    );
    const konflikt = await messe(subA, e, { wert: 10 }, schluessel);
    expect(konflikt).toMatchObject({
      status: 409,
      body: { fehler: { code: "idempotenz.schluessel_konflikt" } },
    });
  });
});

describe("US-WAC-01 Mandantentrennung (P-04)", () => {
  it("ein fremdes oder unbekanntes Exemplar: 404 beim Messen und beim Lesen, nichts geschrieben", async () => {
    const bens = await neuesExemplar(subB, "Ben");
    const unbekannt = randomUUID();
    for (const id of [bens, unbekannt]) {
      expect(await messe(subA, id, { wert: 10 })).toMatchObject({
        status: 404,
        body: { fehler: { code: "exemplar.nicht_gefunden" } },
      });
      expect(await rufe(subA, "GET", `/exemplare/${id}/messungen`)).toMatchObject({
        status: 404,
        body: { fehler: { code: "exemplar.nicht_gefunden" } },
      });
    }
    expect((await rufe(subB, "GET", `/exemplare/${bens}/messungen`)).body["messungen"]).toEqual([]);
  });

  it("Messungen eines Kontos erscheinen nie in der Ansicht eines anderen", async () => {
    const annas = await neuesExemplar(subA, "Anna");
    await messe(subA, annas, { wert: 7 });
    expect(await rufe(subB, "GET", `/exemplare/${annas}/messungen`)).toMatchObject({ status: 404 });
  });
});

describe("US-WAC-01 Systemuhr", () => {
  it("ohne eingesetzte Uhr gilt die Systemzeit: das Datum ist heute und nicht in der Zukunft", async () => {
    const echt = createApp({ pruefer, pool });
    const sende = async (pfad: string, body: unknown) => {
      const res = await echt.request(pfad, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer gueltig:${subA}`,
          "idempotency-key": randomUUID(),
        },
        body: JSON.stringify(body),
      });
      return (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    const art = await sende("/arten", {
      lateinischerName: `Systemuhr${lauf} test`,
      schwierigkeit: 2,
      standardStufe: 3,
      lichtbedarfLux: 40000,
      wachstumsmass: "hoehe",
      vergeilungAnzeichen: "Streckt sich.",
      erfolgskriterien: "Kompakt.",
    });
    const exemplar = await sende("/exemplare", { artId: art["id"], zeitzone: "UTC" });
    const messung = await sende(`/exemplare/${exemplar["id"]}/messungen`, {
      wert: 3,
      zeitzone: "UTC",
    });
    expect(messung["datum"]).toBe(heuteLokal(new Date(), "UTC"));
  });
});
