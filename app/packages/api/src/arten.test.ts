import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migriere, oeffnePool } from "@pflanzendex/db";
import { createApp } from "./app";
import type { TokenPruefer } from "./auth/token";

// US-BES-01: Arten suchen, ansehen und vorschlagen über die API (echte PostgreSQL, `make db-up`).
let pool: Pool;
// Nur Buchstaben: ein Epitheton enthält keine Ziffern.
const lauf = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `art-${randomUUID()}`;
const subB = `art-${randomUUID()}`;
const pruefer: TokenPruefer = async (token) => {
  const [art, sub] = token.split(":");
  return art === "gueltig"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
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

const profil = (name: string, extra: Record<string, unknown> = {}) => ({
  lateinischerName: name,
  schwierigkeit: 2,
  standardStufe: 3,
  lichtbedarfLux: 40000,
  wachstumsmass: "rosettendurchmesser",
  vergeilungAnzeichen: "Rosette streckt sich.",
  erfolgskriterien: "Dichte, flache Rosette.",
  ...extra,
});

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
  app = createApp({ pruefer, pool });
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

describe("US-BES-01 Anmeldung und Eingabe", () => {
  it.each([
    ["GET", "/arten"],
    ["GET", "/arten/00000000-0000-4000-8000-000000000001"],
    ["POST", "/arten"],
  ])("%s %s ohne Token: 401", async (methode, pfad) => {
    expect((await rufe(null, methode, pfad, methode === "POST" ? {} : undefined)).status).toBe(401);
  });

  it("ohne Idempotency-Key: 400 mit stabilem Fehlercode", async () => {
    const r = await rufe(subA, "POST", "/arten", profil("Aloe vera"), null);
    expect(r).toMatchObject({
      status: 400,
      body: { fehler: { code: "idempotenz.schluessel_fehlt" } },
    });
  });

  it("fehlende Pflichtfelder: 400 mit allen betroffenen Feldern", async () => {
    const r = await rufe(subA, "POST", "/arten", { lateinischerName: "Aloe vera" });
    expect(r.status).toBe(400);
    expect(r.body["fehler"].details.map((d: { feld: string }) => d.feld)).toEqual([
      "schwierigkeit",
      "standardStufe",
      "lichtbedarfLux",
      "wachstumsmass",
      "vergeilungAnzeichen",
      "erfolgskriterien",
    ]);
  });
});

describe("US-BES-01 Art vorschlagen, suchen und ansehen", () => {
  const name = `Echeveria ${lauf}`;

  it("der Vorschlag ist 201, trägt den Status vorschlag und ist nur für den Ersteller sichtbar", async () => {
    const neu = await rufe(
      subA,
      "POST",
      "/arten",
      profil(name, { deutscherName: `Echeverie ${lauf}` }),
    );
    expect(neu).toMatchObject({
      status: 201,
      body: { pruefstatus: "vorschlag", eigener: true, ruheVon: null, quelle: null },
    });
    const id = neu.body["id"];
    expect((await rufe(subA, "GET", `/arten/${id}`)).body).toMatchObject({
      lateinischerName: name,
    });
    const fremd = await rufe(subB, "GET", `/arten/${id}`);
    expect(fremd).toMatchObject({ status: 404, body: { fehler: { code: "art.nicht_gefunden" } } });
    const suche = (sub: string) =>
      rufe(sub, "GET", `/arten?q=${encodeURIComponent(`echeverie ${lauf}`)}`);
    expect((await suche(subA)).body["arten"]).toHaveLength(1);
    expect((await suche(subB)).body["arten"]).toEqual([]);
  });

  it("Dublette: 409 mit Verweis auf die vorhandene Art; ein anderer Nutzer darf seinen eigenen Vorschlag anlegen", async () => {
    const r = await rufe(subA, "POST", "/arten", profil(name.toUpperCase()));
    expect(r).toMatchObject({ status: 409, body: { fehler: { code: "art.dublette" } } });
    expect(r.body["fehler"].daten.vorhandene.lateinischerName).toBe(name);
    expect((await rufe(subB, "POST", "/arten", profil(name))).status).toBe(201);
  });

  it("gleicher Wiederholungsschutz-Schlüssel: kein zweiter Eintrag", async () => {
    const schluessel = randomUUID();
    const eingabe = profil(`Haworthia ${lauf}`);
    const a = await rufe(subA, "POST", "/arten", eingabe, schluessel);
    const b = await rufe(subA, "POST", "/arten", eingabe, schluessel);
    expect(b.body["id"]).toBe(a.body["id"]);
  });

  it("ungültige Kennung: 404 statt Serverfehler", async () => {
    expect((await rufe(subA, "GET", "/arten/kein-uuid")).status).toBe(404);
  });
});
