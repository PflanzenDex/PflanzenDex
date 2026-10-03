import {
  KEIN_SOLL_STANDORT,
  exemplarAnlegen,
  exemplarLaden,
  exemplareListe,
  fehler,
  type SollStandortQuelle,
} from "@pflanzendex/core";
import { ArtPostgres, ExemplarePostgres, IdempotenzPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { fehlerKoerper, koerper, schreibe, type AuthEnv } from "../kern";

/** Pfade, die der Anmeldeschutz (Bearer-Token) abdecken muss. */
export const EXEMPLARE_PFADE = ["/exemplare"] as const;

export type ExemplareOptionen = {
  /** Soll-Standort je Art und Tag; setzt `pflege` um (PHA), bis dahin kennt niemand einen (P-08). */
  sollStandort?: SollStandortQuelle;
  /** Die Uhr für „heute“ (NFR-08); Tests setzen sie fest. */
  uhr?: () => Date;
};

/**
 * Exemplare (US-BES-02). Schreiben geht nur über `exemplar.anlegen` (P-03, mit `Idempotency-Key`); Lesen liefert nur
 * Exemplare des eigenen Kontos, ein fremdes oder unbekanntes Exemplar sieht gleich aus: 404 (P-04).
 */
export function exemplareRouten(pool: Pool, opt: ExemplareOptionen = {}): Hono<AuthEnv> {
  const exemplare = new ExemplarePostgres(pool);
  const deps = { idempotenz: new IdempotenzPostgres(pool) };
  const anlegen = exemplarAnlegen({
    exemplare,
    arten: new ArtPostgres(pool),
    sollStandort: opt.sollStandort ?? KEIN_SOLL_STANDORT,
    uhr: opt.uhr ?? (() => new Date()),
  });
  const routen = new Hono<AuthEnv>();

  routen.get("/exemplare", async (c) =>
    c.json({ exemplare: await exemplareListe(exemplare, c.get("konto").id) }),
  );
  routen.get("/exemplare/:id", async (c) => {
    const e = await exemplarLaden(exemplare, c.get("konto").id, c.req.param("id"));
    return e ? c.json(e) : c.json(fehlerKoerper(fehler("exemplar.nicht_gefunden")), 404);
  });
  routen.post("/exemplare", async (c) =>
    schreibe(c, deps, anlegen, { eingabe: await koerper(c), erfolg: 201 }),
  );
  return routen;
}
