import { fehler, messAnsicht, messungErfassen } from "@pflanzendex/core";
import {
  ArtPostgres,
  ExemplarePostgres,
  IdempotenzPostgres,
  MessungenPostgres,
} from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { fehlerKoerper, koerper, schreibe, type AuthEnv } from "../kern";

/** Pfade, die der Anmeldeschutz (Bearer-Token) abdecken muss. */
export const PFLEGE_PFADE = ["/exemplare/:id/messungen"] as const;

export type PflegeOptionen = {
  /** Die Uhr für „heute“ (NFR-08); Tests setzen sie fest. */
  uhr?: () => Date;
};

/**
 * Messungen eines Exemplars (US-WAC-01). Schreiben geht nur über `messung.erfassen` (P-03, mit `Idempotency-Key`);
 * Lesen liefert nur Messungen des eigenen Kontos, ein fremdes oder unbekanntes Exemplar sieht gleich aus: 404 (P-04).
 */
export function pflegeRouten(pool: Pool, opt: PflegeOptionen = {}): Hono<AuthEnv> {
  const exemplare = new ExemplarePostgres(pool);
  const messungen = new MessungenPostgres(pool);
  const deps = { idempotenz: new IdempotenzPostgres(pool) };
  const erfassen = messungErfassen({ messungen, exemplare, uhr: opt.uhr ?? (() => new Date()) });
  const routen = new Hono<AuthEnv>();

  routen.get("/exemplare/:id/messungen", async (c) => {
    const a = await messAnsicht(
      { messungen, exemplare, arten: new ArtPostgres(pool) },
      c.get("konto").id,
      c.req.param("id"),
    );
    return a ? c.json(a) : c.json(fehlerKoerper(fehler("exemplar.nicht_gefunden")), 404);
  });
  routen.post("/exemplare/:id/messungen", async (c) =>
    schreibe(c, deps, erfassen, {
      eingabe: { ...(await koerper(c)), exemplarId: c.req.param("id") },
      erfolg: 201,
    }),
  );
  return routen;
}
