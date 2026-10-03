import { pflegephasenListe } from "@pflanzendex/core";
import { ArtPostgres, ExemplarePostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { fehlerKoerper, statusFuer, type AuthEnv } from "../kern";

/** Pfade, die der Anmeldeschutz (Bearer-Token) abdecken muss. */
export const PFLEGEPHASEN_PFADE = ["/pflegephasen"] as const;

export type PflegephasenOptionen = {
  /** Die Uhr für „heute“ (NFR-08); Tests setzen sie fest. */
  uhr?: () => Date;
};

/**
 * Pflegephasen (US-PHA-01), nur lesend: die Phase wird bei jeder Abfrage aus dem Kalender abgeleitet, nie gespeichert
 * (P-01). `zeitzone` (IANA-Name, vorerst vom Gerät, bis das Profil eine kennt, US-ACC-02) bestimmt „heute“.
 */
export function pflegephasenRouten(pool: Pool, opt: PflegephasenOptionen = {}): Hono<AuthEnv> {
  const deps = {
    exemplare: new ExemplarePostgres(pool),
    arten: new ArtPostgres(pool),
    uhr: opt.uhr ?? (() => new Date()),
  };
  const routen = new Hono<AuthEnv>();
  routen.get("/pflegephasen", async (c) => {
    const r = await pflegephasenListe(deps, c.get("konto").id, c.req.query("zeitzone"));
    return r.ok
      ? c.json({ phasen: r.wert })
      : c.json(fehlerKoerper(r.fehler), statusFuer(r.fehler));
  });
  return routen;
}
