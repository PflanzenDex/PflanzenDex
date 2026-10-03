import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migriere, oeffnePool } from "@pflanzendex/db";
import { createApp } from "./app";
import { nurMitBestaetigterEmail } from "./auth/middleware";
import type { TokenPruefer } from "./auth/token";

// US-ACC-01: Die API prüft das Token und setzt das Konto je Anfrage (mitKonto). Datenbank: `make db-up`.
let pool: Pool;
const sub1 = `api-${randomUUID()}`;
const sub2 = `api-${randomUUID()}`;

// Statt des Anmeldedienstes: "gueltig:<sub>:<verified>" ist ein gültiges Token (die Prüfung selbst testet token.test.ts).
const pruefer: TokenPruefer = async (token) => {
  const [art, sub, verified] = token.split(":");
  if (art !== "gueltig") return null;
  return {
    sub,
    email: `${sub}@example.test`,
    name: "Lena Test",
    email_verified: verified === "ja",
  };
};
const mit = (token?: string) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} });
type KontoAntwort = { id: string; email: string };
const konto = async (app: ReturnType<typeof createApp>, init: object) =>
  (await (await app.request("/konto", init)).json()) as KontoAntwort & Record<string, unknown>;

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
});
afterAll(async () => {
  await pool.query("delete from konto where subjekt = any($1)", [[sub1, sub2]]);
  await pool.end();
});

describe("GET /konto (US-ACC-01)", () => {
  it("ohne Token: 401 ohne Hinweis auf den Grund", async () => {
    const res = await createApp({ pruefer, pool }).request("/konto");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Bearer/);
    expect(await res.json()).toEqual({ fehler: { code: "nicht_angemeldet" } });
  });

  it("mit ungültigem Token: 401", async () => {
    const res = await createApp({ pruefer, pool }).request("/konto", mit("kaputt"));
    expect(res.status).toBe(401);
  });

  it("legt bei der ersten Anfrage das Konto samt Kontodaten an und liefert es", async () => {
    const app = createApp({ pruefer, pool });
    const res = await app.request("/konto", mit(`gueltig:${sub1}:nein`));
    expect(res.status).toBe(200);
    const k = (await res.json()) as KontoAntwort;
    expect(k).toMatchObject({
      email: `${sub1}@example.test`,
      anzeigename: "Lena Test",
      emailBestaetigt: false,
      darfMitFreundenTeilen: false,
    });
    const zweite = await konto(app, mit(`gueltig:${sub1}:nein`));
    expect(zweite.id).toBe(k.id);
  });

  it("übernimmt die Bestätigung der E-Mail-Adresse aus dem Token", async () => {
    const app = createApp({ pruefer, pool });
    const vorher = await konto(app, mit(`gueltig:${sub2}:nein`));
    const nachher = await konto(app, mit(`gueltig:${sub2}:ja`));
    expect(nachher.id).toBe(vorher.id);
    expect(nachher).toMatchObject({ emailBestaetigt: true, darfMitFreundenTeilen: true });
  });

  it("jede Person sieht nur das eigene Konto", async () => {
    const app = createApp({ pruefer, pool });
    const a = await konto(app, mit(`gueltig:${sub1}:nein`));
    const b = await konto(app, mit(`gueltig:${sub2}:ja`));
    expect(a.id).not.toBe(b.id);
    expect(a.email).not.toBe(b.email);
  });

  it("/health bleibt ohne Anmeldung erreichbar", async () => {
    const res = await createApp({ pruefer, pool }).request("/health");
    expect(res.status).toBe(200);
  });
});

describe("Teilen mit Freunden nur mit bestätigter E-Mail-Adresse (US-ACC-01)", () => {
  function app() {
    const a = createApp({ pruefer, pool });
    a.post("/konto/test-teilen", nurMitBestaetigterEmail, (c) => c.json({ geteilt: true }));
    return a;
  }

  it("unbestätigt: 403 mit klarer nächster Handlung", async () => {
    const res = await app().request("/konto/test-teilen", {
      method: "POST",
      ...mit(`gueltig:${sub1}:nein`),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ fehler: { code: "email_unbestaetigt" } });
  });

  it("bestätigt: erlaubt", async () => {
    const res = await app().request("/konto/test-teilen", {
      method: "POST",
      ...mit(`gueltig:${sub2}:ja`),
    });
    expect(res.status).toBe(200);
  });
});
