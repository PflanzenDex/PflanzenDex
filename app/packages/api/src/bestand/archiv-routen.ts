import { exemplarArchiv, exemplarArchivieren, exemplarWiederherstellen } from "@pflanzendex/core";
import { ArtPostgres, ExemplarePostgres, IdempotenzPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { koerper, schreibe, type AuthEnv } from "../kern";

/**
 * Archivieren und Wiederherstellen (US-BES-07). Schreiben nur über die Operationen (P-03, `Idempotency-Key`); das
 * Archiv liefert nur Exemplare des eigenen Kontos (P-04). Wird vor `/exemplare/:id` eingehängt, sonst wäre „archiv“
 * eine Kennung.
 */
export function archivRouten(pool: Pool, uhr: () => Date): Hono<AuthEnv> {
  const exemplare = new ExemplarePostgres(pool);
  const arten = new ArtPostgres(pool);
  const deps = { idempotenz: new IdempotenzPostgres(pool) };
  const archivieren = exemplarArchivieren({ exemplare, uhr });
  const wiederherstellen = exemplarWiederherstellen({ exemplare });
  const routen = new Hono<AuthEnv>();

  routen.get("/exemplare/archiv", async (c) =>
    c.json({ archiv: await exemplarArchiv({ exemplare, arten }, c.get("konto").id) }),
  );
  routen.post("/exemplare/:id/archivieren", async (c) =>
    schreibe(c, deps, archivieren, {
      eingabe: { ...(await koerper(c)), exemplarId: c.req.param("id") },
    }),
  );
  routen.post("/exemplare/:id/wiederherstellen", async (c) =>
    schreibe(c, deps, wiederherstellen, { eingabe: { exemplarId: c.req.param("id") } }),
  );
  return routen;
}
