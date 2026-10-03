import { randomUUID } from "node:crypto";
import type { BehandlungsQuelle, MessungsQuelle } from "@pflanzendex/core";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migriere, oeffnePool } from "@pflanzendex/db";
import { createApp, type AppOptionen } from "../app";

type TokenPruefer = NonNullable<AppOptionen["pruefer"]>;

// US-BES-07: Exemplare archivieren und wiederherstellen über die API (echte PostgreSQL, `make db-up`).
let pool: Pool;
const subA = `bes7-${randomUUID()}`;
const subB = `bes7-${randomUUID()}`;
const pruefer: TokenPruefer = async (token) => {
  const [art, sub] = token.split(":");
  return art === "gueltig"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
// 2026-10-02 23:30 UTC: in Berlin schon der 3. Oktober, in New York noch der 2. (NFR-08)
const JETZT = new Date("2026-10-02T23:30:00Z");
type Antwort = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

// Die Ports von WAC und BEH merken sich, nach welchen Exemplaren sie gefragt wurden.
const gefragt: string[] = [];
const messungen: MessungsQuelle = {
  fuer: async (_n, ids) => (gefragt.push(...ids), new Map()),
};
const behandlungen: BehandlungsQuelle = {
  offene: async (_n, ids) => (gefragt.push(...ids), new Map()),
};
let app: ReturnType<typeof createApp>;

async function rufe(
  sub: string | null,
  methode: string,
  pfad: string,
  body?: unknown,
  schluessel: string | null = randomUUID(),
): Promise<Antwort> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer gueltig:${sub}`;
  if (methode !== "GET" && schluessel) headers["idempotency-key"] = schluessel;
  const res = await app.request(pfad, {
    method: methode,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const neueArt = async (sub: string, name: string, deutsch: string) =>
  (
    await rufe(sub, "POST", "/arten", {
      lateinischerName: name,
      deutscherName: deutsch,
      schwierigkeit: 2,
      standardStufe: 3,
      lichtbedarfLux: 40000,
      wachstumsmass: "rosettendurchmesser",
      vergeilungAnzeichen: "Rosette streckt sich.",
      erfolgskriterien: "Dichte, flache Rosette.",
    })
  ).body["id"] as string;
const legeAn = async (sub: string, art: string, kennzeichen?: string) =>
  (
    await rufe(sub, "POST", "/exemplare", {
      artId: art,
      zeitzone: "Europe/Berlin",
      ...(kennzeichen ? { kennzeichen } : {}),
    })
  ).body["id"] as string;
const archiviere = (sub: string | null, id: string, extra: Record<string, unknown> = {}) =>
  rufe(sub, "POST", `/exemplare/${id}/archivieren`, {
    zeitzone: "Europe/Berlin",
    grund: "eingegangen",
    ...extra,
  });
const stelleWiederHer = (sub: string | null, id: string) =>
  rufe(sub, "POST", `/exemplare/${id}/wiederherstellen`, {});
const ids = (a: Antwort, feld: string) => (a.body[feld] as { id: string }[]).map((x) => x.id);

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
  app = createApp({ pruefer, pool, uhr: () => JETZT, messungen, behandlungen });
});
afterAll(async () => {
  // Erst die Exemplare: der Verweis auf die Art ist on delete restrict (AB-10).
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

describe("US-BES-07 Anmeldung und Eingabe", () => {
  const E = "00000000-0000-4000-8000-000000000001";
  it.each([
    ["POST", `/exemplare/${E}/archivieren`],
    ["POST", `/exemplare/${E}/wiederherstellen`],
    ["GET", "/exemplare/archiv"],
  ])("%s %s ohne Token: 401", async (methode, pfad) => {
    expect((await rufe(null, methode, pfad, methode === "POST" ? {} : undefined)).status).toBe(401);
  });

  it("ohne Idempotency-Key: 400 mit stabilem Fehlercode", async () => {
    const r = await rufe(subA, "POST", `/exemplare/${E}/archivieren`, {}, null);
    expect(r).toMatchObject({
      status: 400,
      body: { fehler: { code: "idempotenz.schluessel_fehlt" } },
    });
  });

  it("ohne Grund: 400 mit Detail zum Feld, nichts wird archiviert", async () => {
    const art = await neueArt(subA, `Eingabe ${randomUUID()}`, `Eingabe ${randomUUID()}`);
    const id = await legeAn(subA, art);
    const r = await archiviere(subA, id, { grund: "  " });
    expect(r).toMatchObject({
      status: 400,
      body: { fehler: { code: "eingabe.ungueltig", details: [{ feld: "grund" }] } },
    });
    expect((await rufe(subA, "GET", `/exemplare/${id}`)).body["status"]).toBe("pflanze");
  });
});

describe("US-BES-07 Archivieren, Listen und Wiederherstellen", () => {
  it("setzt Status, lokales Datum und Grund; Listen und Karten blenden das Exemplar aus", async () => {
    const art = await neueArt(subA, `Liste ${randomUUID()}`, `Liste ${randomUUID()}`);
    const weg = await legeAn(subA, art, "weg");
    const da = await legeAn(subA, art, "da");
    gefragt.length = 0;
    const r = await archiviere(subA, weg, { grund: "verschenkt" });
    expect(r).toMatchObject({
      status: 200,
      body: {
        id: weg,
        status: "archiviert",
        archiviertAm: "2026-10-03",
        archiviertGrund: "verschenkt",
      },
    });
    const liste = await rufe(subA, "GET", "/exemplare");
    expect(ids(liste, "exemplare")).toEqual(expect.arrayContaining([da]));
    expect(ids(liste, "exemplare")).not.toContain(weg);
    const karten = await rufe(subA, "GET", "/exemplare/karten?zeitzone=Europe%2FBerlin");
    expect(ids(karten, "karten")).not.toContain(weg);
    expect(gefragt).not.toContain(weg);
    expect(gefragt).toContain(da);
  });

  it("das archivierte Exemplar bleibt ladbar und steht im Archiv (mit Art, Datum, Grund)", async () => {
    const art = await neueArt(subA, `Archiv ${randomUUID()}`, `Archivart ${randomUUID()}`);
    const id = await legeAn(subA, art);
    await archiviere(subA, id, { grund: "abgegeben", zeitzone: "America/New_York" });
    expect(await rufe(subA, "GET", `/exemplare/${id}`)).toMatchObject({
      status: 200,
      body: { status: "archiviert", archiviertGrund: "abgegeben", archiviertAm: "2026-10-02" },
    });
    const archiv = await rufe(subA, "GET", "/exemplare/archiv");
    expect(archiv.status).toBe(200);
    expect(archiv.body["archiv"]).toContainEqual(
      expect.objectContaining({ id, archiviertGrund: "abgegeben", archiviertAm: "2026-10-02" }),
    );
  });

  it("Wiederherstellen bringt das Exemplar in Liste und Karten zurück und löscht Datum und Grund", async () => {
    const art = await neueArt(subA, `Zurück ${randomUUID()}`, `Zurück ${randomUUID()}`);
    const id = await legeAn(subA, art);
    await archiviere(subA, id);
    expect(await stelleWiederHer(subA, id)).toMatchObject({
      status: 200,
      body: { status: "pflanze", archiviertAm: null, archiviertGrund: null },
    });
    expect(ids(await rufe(subA, "GET", "/exemplare"), "exemplare")).toContain(id);
    expect(ids(await rufe(subA, "GET", "/exemplare/archiv"), "archiv")).not.toContain(id);
  });

  it("doppeltes Archivieren und Wiederherstellen ohne Archiv: 409 mit Fehlercode", async () => {
    const art = await neueArt(subA, `Zweimal ${randomUUID()}`, `Zweimal ${randomUUID()}`);
    const id = await legeAn(subA, art);
    expect((await stelleWiederHer(subA, id)).body).toMatchObject({
      fehler: { code: "exemplar.nicht_archiviert" },
    });
    await archiviere(subA, id, { grund: "eingegangen" });
    const zweites = await archiviere(subA, id, { grund: "verkauft" });
    expect(zweites).toMatchObject({
      status: 409,
      body: { fehler: { code: "exemplar.bereits_archiviert" } },
    });
    expect((await rufe(subA, "GET", `/exemplare/${id}`)).body["archiviertGrund"]).toBe(
      "eingegangen",
    );
  });

  it("ein archivierter Name bleibt vergeben (409), damit das Wiederherstellen nie kollidiert", async () => {
    const art = await neueArt(subA, `Name ${randomUUID()}`, `Namensart ${randomUUID()}`);
    const id = await legeAn(subA, art);
    await archiviere(subA, id);
    const nochmal = await rufe(subA, "POST", "/exemplare", {
      artId: art,
      zeitzone: "Europe/Berlin",
    });
    expect(nochmal).toMatchObject({
      status: 409,
      body: { fehler: { code: "exemplar.name_vergeben" } },
    });
  });

  it("ein archiviertes Exemplar lässt sich nicht messen (409), seine Messreihe bleibt lesbar", async () => {
    const art = await neueArt(subA, `Messen ${randomUUID()}`, `Messart ${randomUUID()}`);
    const id = await legeAn(subA, art);
    const messe = () =>
      rufe(subA, "POST", `/exemplare/${id}/messungen`, { zeitzone: "Europe/Berlin", wert: 12 });
    expect((await messe()).status).toBe(201);
    await archiviere(subA, id);
    expect(await messe()).toMatchObject({
      status: 409,
      body: { fehler: { code: "exemplar.archiviert" } },
    });
    const m = await rufe(subA, "GET", `/exemplare/${id}/messungen`);
    expect(m.status).toBe(200);
    expect(m.body["messungen"]).toHaveLength(1);
  });
});

describe("US-BES-07 Mandantentrennung (P-04)", () => {
  it("ein fremdes Exemplar lässt sich weder archivieren noch wiederherstellen (404 wie unbekannt)", async () => {
    const art = await neueArt(subA, `Fremd ${randomUUID()}`, `Fremdart ${randomUUID()}`);
    const annas = await legeAn(subA, art);
    const fremd = await archiviere(subB, annas);
    const unbekannt = await archiviere(subB, "99999999-9999-4999-8999-999999999999");
    expect(fremd).toMatchObject({
      status: 404,
      body: { fehler: { code: "exemplar.nicht_gefunden" } },
    });
    expect(fremd.body).toEqual(unbekannt.body);
    expect((await rufe(subA, "GET", `/exemplare/${annas}`)).body["status"]).toBe("pflanze");
    await archiviere(subA, annas);
    expect((await stelleWiederHer(subB, annas)).status).toBe(404);
    expect((await rufe(subA, "GET", `/exemplare/${annas}`)).body["status"]).toBe("archiviert");
  });

  it("das Archiv eines Kontos enthält nichts von einem anderen", async () => {
    const art = await neueArt(subB, `Archivb ${randomUUID()}`, `Archivbart ${randomUUID()}`);
    const bens = await legeAn(subB, art);
    await archiviere(subB, bens);
    const annas = await rufe(subA, "GET", "/exemplare/archiv");
    expect(ids(annas, "archiv")).not.toContain(bens);
    expect(ids(await rufe(subB, "GET", "/exemplare/archiv"), "archiv")).toContain(bens);
  });
});
