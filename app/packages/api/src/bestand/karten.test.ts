import { randomUUID } from "node:crypto";
import type { BehandlungsQuelle, MessungsAnsicht, MessungsQuelle } from "@pflanzendex/core";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migriere, oeffnePool } from "@pflanzendex/db";
import { createApp, type AppOptionen } from "../app";

type TokenPruefer = NonNullable<AppOptionen["pruefer"]>;

// US-BES-06: Exemplare als Karten über die API (echte PostgreSQL, `make db-up`).
let pool: Pool;
const lauf = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `bes6-${randomUUID()}`;
const subB = `bes6-${randomUUID()}`;
const pruefer: TokenPruefer = async (token) => {
  const [art, sub] = token.split(":");
  return art === "gueltig"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
// 2026-10-02 23:30 UTC: in Berlin schon der 3. Oktober (NFR-08).
const JETZT = new Date("2026-10-02T23:30:00Z");
type Antwort = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

// Stand der Ports von WAC und BEH: gibt es noch nicht, die Tests setzen Stubs ein, die nur nach den Exemplaren des
// fragenden Kontos antworten dürfen.
const gefragt: { port: string; nutzerId: string; ids: readonly string[] }[] = [];
let messungenFuer: Record<string, MessungsAnsicht> = {};
let behandlungenFuer: Record<string, { id: string; grund: string; faelligAm: string }[]> = {};
const messungen: MessungsQuelle = {
  fuer: async (nutzerId, ids) => {
    gefragt.push({ port: "messungen", nutzerId, ids });
    return new Map(
      ids.flatMap((id) => (messungenFuer[id] ? [[id, messungenFuer[id]] as const] : [])),
    );
  },
};
const behandlungen: BehandlungsQuelle = {
  offene: async (nutzerId, ids) => {
    gefragt.push({ port: "behandlungen", nutzerId, ids });
    return new Map(
      ids.flatMap((id) => (behandlungenFuer[id] ? [[id, behandlungenFuer[id]] as const] : [])),
    );
  },
};
let app: ReturnType<typeof createApp>;
let appOhnePorts: ReturnType<typeof createApp>;

async function rufe(
  sub: string | null,
  methode: string,
  pfad: string,
  body?: unknown,
  a = app,
): Promise<Antwort> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer gueltig:${sub}`;
  if (methode !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await a.request(pfad, {
    method: methode,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const karten = (sub: string | null, zeitzone: string | null = "Europe/Berlin", a = app) =>
  rufe(
    sub,
    "GET",
    `/exemplare/karten${zeitzone ? `?zeitzone=${encodeURIComponent(zeitzone)}` : ""}`,
    undefined,
    a,
  );

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
const anlegen = (sub: string, eingabe: Record<string, unknown>) =>
  rufe(sub, "POST", "/exemplare", { zeitzone: "Europe/Berlin", ...eingabe });

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
  app = createApp({ pruefer, pool, uhr: () => JETZT, messungen, behandlungen });
  appOhnePorts = createApp({ pruefer, pool, uhr: () => JETZT });
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

describe("US-BES-06 Karten: Anmeldung und Eingabe", () => {
  it("GET /exemplare/karten ohne Token: 401", async () => {
    expect((await karten(null)).status).toBe(401);
  });

  it("ohne oder mit unbekannter Zeitzone: 400 eingabe.ungueltig, kein Raten (NFR-08)", async () => {
    for (const zeitzone of [null, "Mars/Olympus", "+02:00"]) {
      const r = await karten(subA, zeitzone);
      expect(r).toMatchObject({ status: 400, body: { fehler: { code: "eingabe.ungueltig" } } });
    }
  });

  it("die Route „karten“ wird nicht als Kennung eines Exemplars gelesen", async () => {
    expect((await karten(subA)).status).toBe(200);
  });
});

describe("US-BES-06 Karten: Inhalt", () => {
  it("zeigt Name, Art, Status, Standort und Lichtzone; ohne Messung und Behandlung bleiben die Felder leer", async () => {
    const artId = await neueArt(subA, `Aloe${lauf} vera`, `Aloe ${lauf}`);
    const zone = await rufe(subA, "POST", "/lichtzonen", { name: `Zone ${lauf}`, luxDecke: 30000 });
    const standort = await rufe(subA, "POST", "/standorte", {
      name: `Regal ${lauf}`,
      art: "innen",
      lichtzoneId: zone.body["id"],
    });
    await anlegen(subA, { artId, standortId: standort.body["id"] });
    const r = await karten(subA);
    expect(r.status).toBe(200);
    expect(r.body["karten"]).toHaveLength(1);
    expect(r.body["karten"][0]).toMatchObject({
      name: `Aloe ${lauf}`,
      artName: `Aloe ${lauf}`,
      status: "pflanze",
      standort: `Regal ${lauf}`,
      lichtzone: `Zone ${lauf}`,
      gefangenAm: "2026-10-03",
      foto: null,
      letzteMessung: null,
      behandlung: null,
      weitereBehandlungen: 0,
    });
  });

  it("ohne Standort ist die Karte „unbekannt“ (null) bei Standort und Lichtzone", async () => {
    const artId = await neueArt(subA, `Agave${lauf} utah`, `Agave ${lauf}`);
    const e = await anlegen(subA, { artId });
    const karte = (await karten(subA)).body["karten"].find(
      (k: { id: string }) => k.id === e.body["id"],
    );
    expect(karte).toMatchObject({ standort: null, lichtzone: null });
  });

  it("Messung, Foto und offene Behandlungen kommen aus den Ports; „heute“ folgt der Zeitzone des Nutzers", async () => {
    const artId = await neueArt(subA, `Yucca${lauf} rostrata`, `Yucca ${lauf}`);
    const e = await anlegen(subA, { artId });
    const id = e.body["id"] as string;
    messungenFuer = {
      [id]: {
        letzte: { datum: "2026-10-01", qualitaet: "vergeilt", notiz: "Streckt sich." },
        foto: { url: "/medien/x.jpg", datum: "2026-09-28" },
      },
    };
    behandlungenFuer = {
      [id]: [
        { id: "b2", grund: "Umtopfen", faelligAm: "2026-10-09" },
        { id: "b1", grund: "Neem spritzen", faelligAm: "2026-10-02" },
      ],
    };
    const berlin = (await karten(subA)).body["karten"].find((k: { id: string }) => k.id === id);
    expect(berlin).toMatchObject({
      letzteMessung: { datum: "2026-10-01", qualitaet: "vergeilt", notiz: "Streckt sich." },
      foto: { url: "/medien/x.jpg", datum: "2026-09-28" },
      behandlung: {
        grund: "Neem spritzen",
        faelligkeit: { art: "ueberfaellig", text: "überfällig seit 1 Tg." },
      },
      weitereBehandlungen: 1,
    });
    // Dieselbe Uhr ist in New York noch der 2. Oktober: die Behandlung ist dort heute fällig.
    const ny = (await karten(subA, "America/New_York")).body["karten"].find(
      (k: { id: string }) => k.id === id,
    );
    expect(ny.behandlung.faelligkeit).toMatchObject({ art: "heute", text: "heute fällig" });
    messungenFuer = {};
    behandlungenFuer = {};
  });

  it("ohne angeschlossene Ports (heute der Fall): noch keine Messung, keine Behandlung, kein Fehler", async () => {
    const r = await karten(subA, "Europe/Berlin", appOhnePorts);
    expect(r.status).toBe(200);
    for (const k of r.body["karten"])
      expect(k).toMatchObject({ letzteMessung: null, behandlung: null });
  });
});

describe("US-BES-06 Karten: Mandant", () => {
  it("ein Konto sieht nur Karten der eigenen Exemplare; die Ports erfahren nie fremde Kennungen", async () => {
    const artId = await neueArt(subB, `Opuntia${lauf} ficus`, `Opuntia ${lauf}`);
    const bens = await anlegen(subB, { artId });
    gefragt.length = 0;
    const annas = await karten(subA);
    expect(annas.body["karten"].map((k: { id: string }) => k.id)).not.toContain(bens.body["id"]);
    expect(JSON.stringify(annas.body)).not.toContain(`Opuntia ${lauf}`);
    const fuerBen = await karten(subB);
    expect(fuerBen.body["karten"].map((k: { id: string }) => k.id)).toContain(bens.body["id"]);
    for (const g of gefragt.filter((x) => x.nutzerId === subA))
      expect(g.ids).not.toContain(bens.body["id"]);
  });

  it("ein Konto ohne Exemplare bekommt eine leere Liste", async () => {
    expect((await karten(`bes6-${randomUUID()}`)).body["karten"]).toEqual([]);
  });
});
