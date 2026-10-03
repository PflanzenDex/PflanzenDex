import { randomUUID } from "node:crypto";
import type { SollStandortQuelle } from "@pflanzendex/core";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migriere, oeffnePool } from "@pflanzendex/db";
import { createApp, type AppOptionen } from "../app";

type TokenPruefer = NonNullable<AppOptionen["pruefer"]>;

// US-BES-04: Steckling anlegen und eintopfen über die API (echte PostgreSQL, `make db-up`).
let pool: Pool;
const subA = `bes4-${randomUUID()}`;
const subB = `bes4-${randomUUID()}`;
const pruefer: TokenPruefer = async (token) => {
  const [art, sub] = token.split(":");
  return art === "gueltig"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
const JETZT = new Date("2026-10-02T23:30:00Z");
type Antwort = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

// Der Port von PHA: der Standort der Wachstumsphase, den ein Test vorgibt.
let wachstum: string | null = null;
const sollStandort: SollStandortQuelle = {
  sollStandort: async () => null,
  wachstumsStandort: async () => wachstum,
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
const lauf = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
let artZaehler = 0;
const neueArt = async (sub: string) => {
  artZaehler += 1;
  const name = `Steck${lauf}${"abcdefghij"[artZaehler] ?? "z"}`;
  const r = await rufe(sub, "POST", "/arten", {
    lateinischerName: `${name} vera`,
    deutscherName: name,
    schwierigkeit: 2,
    standardStufe: 3,
    lichtbedarfLux: 40000,
    wachstumsmass: "rosettendurchmesser",
    vergeilungAnzeichen: "Rosette streckt sich.",
    erfolgskriterien: "Dichte, flache Rosette.",
  });
  return r.body["id"] as string;
};
const anlegen = (sub: string | null, artId: string, extra: Record<string, unknown> = {}) =>
  rufe(sub, "POST", "/exemplare", { artId, zeitzone: "Europe/Berlin", ...extra });
const eintopfen = (sub: string | null, id: string) =>
  rufe(sub, "POST", `/exemplare/${id}/eintopfen`, {});
const karte = async (sub: string, id: string) =>
  (await rufe(sub, "GET", "/exemplare/karten?zeitzone=Europe/Berlin")).body["karten"].find(
    (k: { id: string }) => k.id === id,
  );

// Zwei Zonen: die erste (niedrigste) ist das Stecklingslicht, dazu ein Standort in der zweiten.
async function zonenUndStandort(sub: string) {
  const unten = await rufe(sub, "POST", "/lichtzonen", { name: `Unten ${lauf}`, luxDecke: 10000 });
  const oben = await rufe(sub, "POST", "/lichtzonen", { name: `Oben ${lauf}`, luxDecke: 40000 });
  const standort = await rufe(sub, "POST", "/standorte", {
    name: `Regal ${lauf}`,
    art: "innen",
    lichtzoneId: oben.body["id"],
  });
  return { unten: unten.body["name"], oben: oben.body["name"], standort: standort.body["id"] };
}

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
  app = createApp({ pruefer, pool, uhr: () => JETZT, sollStandort });
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

describe("US-BES-04 Anmeldung und Eingabe", () => {
  it("US-BES-04: Eintopfen ohne Token: 401", async () => {
    const E = "00000000-0000-4000-8000-000000000001";
    expect((await eintopfen(null, E)).status).toBe(401);
  });

  it("US-BES-04: ein ungültiger Status beim Anlegen: 400 mit Detail zum Feld, nichts wird angelegt", async () => {
    const art = await neueArt(subA);
    for (const status of ["archiviert", "tot"]) {
      const r = await anlegen(subA, art, { status });
      expect(r).toMatchObject({
        status: 400,
        body: { fehler: { details: [{ feld: "status", code: "eingabe.ungueltig" }] } },
      });
    }
    expect((await rufe(subA, "GET", "/exemplare")).body["exemplare"]).toEqual([]);
  });
});

describe("US-BES-04 Steckling anlegen und eintopfen", () => {
  it("US-BES-04: ein Steckling steht unter Stecklingslicht und zählt nicht in der Verteilung; Eintopfen holt ihn zurück", async () => {
    const z = await zonenUndStandort(subA);
    const art = await neueArt(subA);
    const r = await anlegen(subA, art, { status: "steckling", standortId: z.standort });
    expect(r).toMatchObject({ status: 201, body: { status: "steckling", standortId: z.standort } });
    const id = r.body["id"] as string;
    expect(await karte(subA, id)).toMatchObject({ status: "steckling", lichtzone: z.unten });
    const vorher = (await rufe(subA, "GET", "/exemplare/verteilung")).body["verteilung"];
    expect(vorher.nichtGezaehlt.stecklingslicht).toBe(1);
    expect(vorher.zonen.map((x: { anzahl: number }) => x.anzahl)).toEqual([0]);

    const topf = await eintopfen(subA, id);
    expect(topf).toMatchObject({ status: 200, body: { id, status: "pflanze" } });
    expect(await karte(subA, id)).toMatchObject({ status: "pflanze", lichtzone: z.oben });
    const nachher = (await rufe(subA, "GET", "/exemplare/verteilung")).body["verteilung"];
    expect(nachher.nichtGezaehlt.stecklingslicht).toBe(0);
    expect(nachher.zonen.map((x: { anzahl: number }) => x.anzahl)).toEqual([1]);
  });

  it("US-BES-04: ohne gewählten Standort gilt der Standort der Wachstumsphase aus dem Port", async () => {
    const z = await zonenUndStandort(subB);
    wachstum = z.standort;
    try {
      const art = await neueArt(subB);
      const r = await anlegen(subB, art, { status: "steckling" });
      expect(r).toMatchObject({
        status: 201,
        body: { status: "steckling", standortId: z.standort },
      });
    } finally {
      wachstum = null;
    }
  });

  it("US-BES-04: ohne Angabe ist das neue Exemplar eine Pflanze", async () => {
    const art = await neueArt(subA);
    const r = await anlegen(subA, art, { kennzeichen: "pflanze" });
    expect(r).toMatchObject({ status: 201, body: { status: "pflanze" } });
  });

  it("US-BES-04: eine Pflanze eintopfen: 409 kein_steckling, der Status bleibt", async () => {
    const art = await neueArt(subA);
    const id = (await anlegen(subA, art, { kennzeichen: "topf" })).body["id"] as string;
    expect(await eintopfen(subA, id)).toMatchObject({
      status: 409,
      body: { fehler: { code: "exemplar.kein_steckling" } },
    });
    expect((await rufe(subA, "GET", `/exemplare/${id}`)).body["status"]).toBe("pflanze");
  });

  it("US-BES-04: ein archivierter Steckling wird nicht eingetopft (409)", async () => {
    const art = await neueArt(subA);
    const id = (await anlegen(subA, art, { status: "steckling", kennzeichen: "arch" })).body[
      "id"
    ] as string;
    await rufe(subA, "POST", `/exemplare/${id}/archivieren`, {
      zeitzone: "Europe/Berlin",
      grund: "abgegeben",
    });
    expect((await eintopfen(subA, id)).body["fehler"].code).toBe("exemplar.kein_steckling");
    expect((await rufe(subA, "GET", `/exemplare/${id}`)).body["status"]).toBe("archiviert");
  });

  it("US-BES-04: derselbe Idempotency-Key wiederholt die erste Antwort", async () => {
    const art = await neueArt(subA);
    const id = (await anlegen(subA, art, { status: "steckling", kennzeichen: "idem" })).body[
      "id"
    ] as string;
    const schluessel = randomUUID();
    const erste = await rufe(subA, "POST", `/exemplare/${id}/eintopfen`, {}, schluessel);
    const zweite = await rufe(subA, "POST", `/exemplare/${id}/eintopfen`, {}, schluessel);
    expect(erste.status).toBe(200);
    expect(zweite).toEqual(erste);
  });
});

describe("US-BES-04 Mandantentrennung (P-04)", () => {
  it("US-BES-04: ein fremder Steckling lässt sich nicht eintopfen (404 wie unbekannt)", async () => {
    const art = await neueArt(subA);
    const annas = (await anlegen(subA, art, { status: "steckling", kennzeichen: "fremd" })).body[
      "id"
    ] as string;
    const fremd = await eintopfen(subB, annas);
    const unbekannt = await eintopfen(subB, "99999999-9999-4999-8999-999999999999");
    expect(fremd).toMatchObject({
      status: 404,
      body: { fehler: { code: "exemplar.nicht_gefunden" } },
    });
    expect(fremd.body).toEqual(unbekannt.body);
    expect((await rufe(subA, "GET", `/exemplare/${annas}`)).body["status"]).toBe("steckling");
  });
});
