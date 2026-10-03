import {
  KEINE_BEHANDLUNGEN,
  KEINE_MESSUNGEN,
  KEIN_SOLL_STANDORT,
  exemplarAnlegen,
  exemplarKarten,
  exemplarLaden,
  exemplareListe,
  fehler,
  heuteLokal,
  istZeitzone,
  zonenVerteilung,
  type BehandlungsQuelle,
  type MessungsQuelle,
  type SollStandortQuelle,
} from "@pflanzendex/core";
import {
  ArtPostgres,
  ExemplarePostgres,
  IdempotenzPostgres,
  StandortePostgres,
  ZonenPostgres,
} from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { fehlerKoerper, koerper, schreibe, type AuthEnv } from "../kern";

/** Pfade, die der Anmeldeschutz (Bearer-Token) abdecken muss. */
export const EXEMPLARE_PFADE = ["/exemplare"] as const;

export type ExemplareOptionen = {
  /** Soll-Standort je Art und Tag; setzt `pflege` um (PHA), bis dahin kennt niemand einen (P-08). */
  sollStandort?: SollStandortQuelle | undefined;
  /** Die Uhr für „heute“ (NFR-08); Tests setzen sie fest. */
  uhr?: (() => Date) | undefined;
  /** Letzte Messung und jüngstes Foto je Exemplar; setzt `pflege` (WAC) um, bis dahin gibt es keine (US-BES-06). */
  messungen?: MessungsQuelle | undefined;
  /** Offene Behandlungen je Exemplar; setzt `pflege` (BEH) um, bis dahin gibt es keine (US-BES-06). */
  behandlungen?: BehandlungsQuelle | undefined;
};

/**
 * Exemplare (US-BES-02). Schreiben geht nur über `exemplar.anlegen` (P-03, mit `Idempotency-Key`); Lesen liefert nur
 * Exemplare des eigenen Kontos, ein fremdes oder unbekanntes Exemplar sieht gleich aus: 404 (P-04).
 */
export function exemplareRouten(pool: Pool, opt: ExemplareOptionen = {}): Hono<AuthEnv> {
  const exemplare = new ExemplarePostgres(pool);
  const deps = { idempotenz: new IdempotenzPostgres(pool) };
  const uhr = opt.uhr ?? (() => new Date());
  const anlegen = exemplarAnlegen({
    exemplare,
    arten: new ArtPostgres(pool),
    sollStandort: opt.sollStandort ?? KEIN_SOLL_STANDORT,
    uhr,
  });
  const kartenDeps = {
    exemplare,
    arten: new ArtPostgres(pool),
    standorte: new StandortePostgres(pool),
    zonen: new ZonenPostgres(pool),
    messungen: opt.messungen ?? KEINE_MESSUNGEN,
    behandlungen: opt.behandlungen ?? KEINE_BEHANDLUNGEN,
  };
  const verteilungDeps = {
    exemplare,
    arten: kartenDeps.arten,
    standorte: kartenDeps.standorte,
    zonen: kartenDeps.zonen,
  };
  const routen = new Hono<AuthEnv>();

  routen.get("/exemplare", async (c) =>
    c.json({ exemplare: await exemplareListe(exemplare, c.get("konto").id) }),
  );
  // Vor `/exemplare/:id`, sonst wäre „karten“ eine Kennung. „Heute“ ist das lokale Datum der Zeitzone des Geräts (NFR-08).
  routen.get("/exemplare/karten", async (c) => {
    const zeitzone = c.req.query("zeitzone");
    if (!istZeitzone(zeitzone)) {
      const details = [{ feld: "zeitzone", code: "eingabe.ungueltig" as const }];
      return c.json(fehlerKoerper(fehler("eingabe.ungueltig", { details })), 400);
    }
    const karten = await exemplarKarten(kartenDeps, c.get("konto").id, heuteLokal(uhr(), zeitzone));
    return c.json({ karten });
  });
  // US-LIC-02: Verteilung auf die Zonen 2 bis 4; wie „karten“ vor `/exemplare/:id`, nur Daten des eigenen Kontos (P-04).
  routen.get("/exemplare/verteilung", async (c) =>
    c.json({ verteilung: await zonenVerteilung(verteilungDeps, c.get("konto").id) }),
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
