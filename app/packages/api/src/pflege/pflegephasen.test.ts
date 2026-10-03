import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migriere, oeffnePool } from "@pflanzendex/db";
import { createApp, type AppOptionen } from "../app";

type TokenPruefer = NonNullable<AppOptionen["pruefer"]>;

// US-PHA-01: Pflegephasen über die API (echte PostgreSQL, `make db-up`).
let pool: Pool;
const lauf = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `pha1-${randomUUID()}`;
const subB = `pha1-${randomUUID()}`;
const pruefer: TokenPruefer = async (token) => {
  const [art, sub] = token.split(":");
  return art === "gueltig"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
// 2026-10-31 23:30 UTC: in Berlin schon der 1. November, in UTC noch der 31. Oktober.
const JETZT = new Date("2026-10-31T23:30:00Z");
let app: ReturnType<typeof createApp>;
type Antwort = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function rufe(sub: string | null, methode: string, pfad: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer gueltig:${sub}`;
  if (methode !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await app.request(pfad, {
    method: methode,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> } as Antwort; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const art = (name: string, ruhe: Record<string, string> = {}) => ({
  lateinischerName: name,
  deutscherName: name,
  schwierigkeit: 2,
  standardStufe: 3,
  lichtbedarfLux: 40000,
  wachstumsmass: "rosettendurchmesser",
  vergeilungAnzeichen: "Rosette streckt sich.",
  erfolgskriterien: "Dichte, flache Rosette.",
  ...ruhe,
});
const neueArt = async (sub: string, name: string, ruhe?: Record<string, string>) =>
  (await rufe(sub, "POST", "/arten", art(name, ruhe))).body["id"] as string;
const exemplar = (sub: string, artId: string) =>
  rufe(sub, "POST", "/exemplare", { artId, zeitzone: "Europe/Berlin" });

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

describe("US-PHA-01 Pflegephasen über die API", () => {
  it("US-PHA-01 ohne Token: 401", async () => {
    expect((await rufe(null, "GET", "/pflegephasen?zeitzone=UTC")).status).toBe(401);
  });

  it("US-PHA-01 ohne gültige Zeitzone: 400 mit Feld zeitzone", async () => {
    for (const pfad of ["/pflegephasen", "/pflegephasen?zeitzone=Nirgendwo"]) {
      const r = await rufe(subA, "GET", pfad);
      expect(r.status).toBe(400);
      expect(r.body["fehler"].code).toBe("eingabe.ungueltig");
      expect(r.body["fehler"].details).toEqual([{ feld: "zeitzone", code: "eingabe.ungueltig" }]);
    }
  });

  it("US-PHA-01 listet nur Exemplare mit Ruhephase und leitet die Phase aus dem lokalen Datum ab", async () => {
    const mit = await neueArt(subA, `Winter${lauf}`, { ruheVon: "11-01", ruheBis: "03-15" });
    const ohne = await neueArt(subA, `Immer${lauf}`);
    await exemplar(subA, mit);
    await exemplar(subA, ohne);

    const berlin = await rufe(subA, "GET", "/pflegephasen?zeitzone=Europe%2FBerlin");
    expect(berlin.status).toBe(200);
    expect(berlin.body["phasen"]).toHaveLength(1);
    expect(berlin.body["phasen"][0]).toMatchObject({
      name: `Winter${lauf}`,
      artId: mit,
      phase: "ruhe",
      standortId: null,
      sollStandortId: null,
    });
    const utc = await rufe(subA, "GET", "/pflegephasen?zeitzone=UTC");
    expect(utc.body["phasen"][0].phase).toBe("wachstum");
  });

  it("US-PHA-01 ohne gesetzte Uhr gilt die Systemzeit", async () => {
    const echt = createApp({ pruefer, pool });
    const res = await echt.request("/pflegephasen?zeitzone=UTC", {
      headers: { authorization: `Bearer gueltig:${subB}` },
    });
    expect(res.status).toBe(200);
  });

  it("US-PHA-01 ein anderes Konto sieht die Exemplare nicht (P-04)", async () => {
    const r = await rufe(subB, "GET", "/pflegephasen?zeitzone=UTC");
    expect(r).toMatchObject({ status: 200, body: { phasen: [] } });
  });
});
