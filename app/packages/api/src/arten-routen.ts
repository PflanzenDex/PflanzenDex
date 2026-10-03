import { artLaden, artSuchen, artVorschlagen, fehler } from "@pflanzendex/core";
import { ArtPostgres, IdempotenzPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import type { AuthEnv } from "./auth/middleware";
import { fehlerKoerper } from "./fehler-http";
import { koerper, schreibe } from "./route-hilfen";

/** Pfade, die der Anmeldeschutz (Bearer-Token) abdecken muss. */
export const ARTEN_PFADE = ["/arten"] as const;

/**
 * Artenkatalog (US-BES-01). Lesen liefert, was das Konto sehen darf: freigegebene Arten und die eigenen
 * Vorschläge (FR-BES-11). Schreiben geht nur über `art.vorschlagen` (Prüfstatus `vorschlag`, P-03).
 * Eine fremde oder unbekannte Art sieht gleich aus: 404.
 */
export function artenRouten(pool: Pool): Hono<AuthEnv> {
  const arten = new ArtPostgres(pool);
  const deps = { idempotenz: new IdempotenzPostgres(pool) };
  const routen = new Hono<AuthEnv>();

  routen.get("/arten", async (c) =>
    c.json({ arten: await artSuchen(arten, c.get("konto").id, c.req.query("q") ?? "") }),
  );
  routen.get("/arten/:id", async (c) => {
    const art = await artLaden(arten, c.get("konto").id, c.req.param("id"));
    return art ? c.json(art) : c.json(fehlerKoerper(fehler("art.nicht_gefunden")), 404);
  });
  routen.post("/arten", async (c) =>
    schreibe(c, deps, artVorschlagen(arten), await koerper(c), 201),
  );
  return routen;
}
