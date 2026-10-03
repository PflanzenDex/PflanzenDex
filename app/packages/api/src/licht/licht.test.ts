import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migriere, oeffnePool } from "@pflanzendex/db";
import { createApp } from "../app";

// US-LIC-05: Standorte und Lichtzonen über die API (echte PostgreSQL, `make db-up`).
let pool: Pool;
const subA = `licht-${randomUUID()}`;
const subB = `licht-${randomUUID()}`;
type TokenPruefer = NonNullable<NonNullable<Parameters<typeof createApp>[0]>["pruefer"]>;
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

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
  app = createApp({ pruefer, pool });
});
afterAll(async () => {
  await pool.query("delete from konto where subjekt = any($1)", [[subA, subB]]);
  await pool.end();
});

describe("US-LIC-05 Anmeldung und Eingabe", () => {
  it.each([
    ["GET", "/lichtzonen"],
    ["POST", "/lichtzonen"],
    ["GET", "/standorte"],
    ["GET", "/hinweise"],
  ])("%s %s ohne Token: 401", async (methode, pfad) => {
    expect((await rufe(null, methode, pfad, methode === "POST" ? {} : undefined)).status).toBe(401);
  });

  it("ohne Idempotency-Key: 400 mit stabilem Fehlercode", async () => {
    const r = await rufe(subA, "POST", "/lichtzonen", { name: "X", luxDecke: 1 }, null);
    expect(r).toMatchObject({
      status: 400,
      body: { fehler: { code: "idempotenz.schluessel_fehlt" } },
    });
  });

  it("ungültige Eingabe: 400 mit den betroffenen Feldern", async () => {
    const r = await rufe(subA, "POST", "/lichtzonen", { name: "", luxDecke: -5 });
    expect(r.status).toBe(400);
    expect(r.body["fehler"].details.map((d: { feld: string }) => d.feld)).toEqual([
      "name",
      "luxDecke",
    ]);
  });
});

describe("US-LIC-05 Lichtzonen und Standorte verwalten", () => {
  it("legt Zone und Standorte an, benennt um und behält die Zuordnung", async () => {
    const z = await rufe(subA, "POST", "/lichtzonen", {
      name: "Regal oben",
      luxDecke: 15000,
      ppfd: 300,
    });
    expect(z.status).toBe(201);
    const s = await rufe(subA, "POST", "/standorte", {
      name: "Fensterbank",
      lichtzoneId: z.body["id"],
      art: "innen",
    });
    expect(s.status).toBe(201);
    const um = await rufe(subA, "PUT", `/lichtzonen/${z.body["id"]}`, {
      name: "Unterholz",
      luxDecke: 12000,
    });
    expect(um).toMatchObject({
      status: 200,
      body: { id: z.body["id"], name: "Unterholz", ppfd: null },
    });
    const liste = await rufe(subA, "GET", "/standorte");
    expect(liste.body["standorte"]).toEqual([
      { id: s.body["id"], name: "Fensterbank", lichtzoneId: z.body["id"], art: "innen" },
    ]);
  });

  it("derselbe Idempotency-Key legt nichts doppelt an", async () => {
    const schluessel = randomUUID();
    const a = await rufe(
      subA,
      "POST",
      "/lichtzonen",
      { name: "Einmalig", luxDecke: 5000 },
      schluessel,
    );
    const b = await rufe(
      subA,
      "POST",
      "/lichtzonen",
      { name: "Einmalig", luxDecke: 5000 },
      schluessel,
    );
    expect(b).toEqual(a);
    const namen = (await rufe(subA, "GET", "/lichtzonen")).body["zonen"].map(
      (x: { name: string }) => x.name,
    );
    expect(namen.filter((n: string) => n === "Einmalig")).toHaveLength(1);
  });

  it("doppelter Name: 409", async () => {
    await rufe(subA, "POST", "/standorte", { name: "Doppelt", art: "innen" });
    const r = await rufe(subA, "POST", "/standorte", { name: "doppelt", art: "aussen" });
    expect(r).toMatchObject({ status: 409, body: { fehler: { code: "standort.name_vergeben" } } });
  });

  it("Zone löschen wird abgelehnt und nennt die nutzenden Standorte; danach geht es", async () => {
    const z = await rufe(subA, "POST", "/lichtzonen", { name: "Belegt", luxDecke: 5000 });
    const s = await rufe(subA, "POST", "/standorte", {
      name: "Auf Belegt",
      lichtzoneId: z.body["id"],
      art: "innen",
    });
    const abgelehnt = await rufe(subA, "DELETE", `/lichtzonen/${z.body["id"]}`);
    expect(abgelehnt).toMatchObject({
      status: 409,
      body: { fehler: { code: "lichtzone.in_benutzung" } },
    });
    expect(abgelehnt.body["fehler"].daten).toEqual([
      { art: "standort", id: s.body["id"], name: "Auf Belegt" },
    ]);
    await rufe(subA, "PUT", `/standorte/${s.body["id"]}`, {
      name: "Auf Belegt",
      lichtzoneId: null,
      art: "innen",
    });
    expect((await rufe(subA, "DELETE", `/lichtzonen/${z.body["id"]}`)).status).toBe(200);
  });

  it("Standorte ohne Zone erscheinen in den Hinweisen", async () => {
    await rufe(subB, "POST", "/standorte", { name: "Balkon", art: "aussen" });
    const r = await rufe(subB, "GET", "/hinweise");
    expect(r.body["hinweise"]).toEqual([
      expect.objectContaining({
        art: "standort_ohne_zone",
        text: expect.stringContaining("Balkon"),
      }),
    ]);
  });

  it("die Voreinstellung legt vier Lampen an, ein zweites Mal wird sie abgelehnt", async () => {
    const r = await rufe(subB, "POST", "/lichtzonen/voreinstellung");
    expect(r.status).toBe(201);
    expect(r.body["zonen"].map((z: { name: string }) => z.name)).toEqual([
      "Lampe 1",
      "Lampe 2",
      "Lampe 3",
      "Lampe 4",
    ]);
    const nochmal = await rufe(subB, "POST", "/lichtzonen/voreinstellung");
    expect(nochmal).toMatchObject({
      status: 409,
      body: { fehler: { code: "lichtzone.nicht_leer" } },
    });
  });
});

describe("US-LIC-05 Mandantentrennung über die API (P-04)", () => {
  it("fremde Zonen und Standorte sind unsichtbar, nicht änderbar und nicht zuordenbar", async () => {
    const z = await rufe(subA, "POST", "/lichtzonen", { name: "Privat A", luxDecke: 1000 });
    const s = await rufe(subA, "POST", "/standorte", { name: "Privat A Platz", art: "innen" });
    const sichtB = await rufe(subB, "GET", "/lichtzonen");
    expect(JSON.stringify(sichtB.body)).not.toContain("Privat A");
    expect(
      (await rufe(subB, "PUT", `/lichtzonen/${z.body["id"]}`, { name: "Weg", luxDecke: 1 })).status,
    ).toBe(404);
    expect((await rufe(subB, "DELETE", `/lichtzonen/${z.body["id"]}`)).status).toBe(404);
    expect(
      (await rufe(subB, "PUT", `/standorte/${s.body["id"]}`, { name: "Weg", art: "innen" })).status,
    ).toBe(404);
    const zuordnen = await rufe(subB, "POST", "/standorte", {
      name: "Klau",
      lichtzoneId: z.body["id"],
      art: "innen",
    });
    expect(zuordnen).toMatchObject({
      status: 404,
      body: { fehler: { code: "lichtzone.nicht_gefunden" } },
    });
  });
});
