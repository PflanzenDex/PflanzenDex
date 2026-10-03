import {
  lichtzoneAendern,
  lichtzoneAnlegen,
  lichtzoneLoeschen,
  lichtzoneVoreinstellung,
  standortAendern,
  standortEinrichten,
  standortHinweise,
  type Operation,
  type ZonenNutzung,
} from "@pflanzendex/core";
import { IdempotenzPostgres, StandortePostgres, ZonenPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import type { AuthEnv } from "./auth/middleware";
import { koerper, schreibe as schreibeMit, type Ctx } from "./route-hilfen";

/** Pfade, die der Anmeldeschutz (Bearer-Token) abdecken muss. */
export const LICHT_PFADE = ["/lichtzonen", "/standorte", "/hinweise"] as const;

/**
 * Standorte und Lichtzonen (US-LIC-05). Schreibzugriffe laufen nur über die Operationen von `core`
 * (Validierung, Wiederholungsschutz per `Idempotency-Key`), Lesezugriffe über die Adapter unter `mitKonto`.
 *
 * Grenze: Arten verlinken keine Zone (der Katalog trägt nur den Lux-Bedarf, die Zone wird abgeleitet, FR-BES-10),
 * brauchen also keine Quelle. Exemplare (BES-02) und Pflegeprofile (DM-BES-04) schon: `zusaetzlicheNutzung` nimmt
 * ihre Quellen auf; bis dahin prüft „Zone löschen“ nur Standorte.
 */
export function lichtRouten(
  pool: Pool,
  zusaetzlicheNutzung: readonly ZonenNutzung[] = [],
): Hono<AuthEnv> {
  const zonen = new ZonenPostgres(pool);
  const standorte = new StandortePostgres(pool);
  const deps = { idempotenz: new IdempotenzPostgres(pool) };
  const routen = new Hono<AuthEnv>();

  const schreibe = <E, A>(
    c: Ctx,
    op: Operation<E, A>,
    eingabe: unknown,
    erfolg: 200 | 201 = 200,
    huelle?: (wert: A) => object,
  ) => schreibeMit(c, deps, op, eingabe, erfolg, huelle);
  const mitId = async (c: Ctx) => ({ ...(await koerper(c)), id: c.req.param("id") });

  routen.get("/lichtzonen", async (c) => c.json({ zonen: await zonen.liste(c.get("konto").id) }));
  routen.post("/lichtzonen/voreinstellung", async (c) =>
    schreibe(c, lichtzoneVoreinstellung(zonen), {}, 201, (zonenListe) => ({ zonen: zonenListe })),
  );
  routen.post("/lichtzonen", async (c) =>
    schreibe(c, lichtzoneAnlegen(zonen), await koerper(c), 201),
  );
  routen.put("/lichtzonen/:id", async (c) => schreibe(c, lichtzoneAendern(zonen), await mitId(c)));
  routen.delete("/lichtzonen/:id", async (c) =>
    schreibe(c, lichtzoneLoeschen(zonen, [standorte, ...zusaetzlicheNutzung]), {
      id: c.req.param("id"),
    }),
  );

  routen.get("/standorte", async (c) =>
    c.json({ standorte: await standorte.liste(c.get("konto").id) }),
  );
  routen.post("/standorte", async (c) =>
    schreibe(c, standortEinrichten(standorte), await koerper(c), 201),
  );
  routen.put("/standorte/:id", async (c) =>
    schreibe(c, standortAendern(standorte), await mitId(c)),
  );

  // Hinweise (US-BES-08): die zentrale Hinweis-Seite folgt mit BES-08; hier liefert LIC-05 seine Hinweise.
  routen.get("/hinweise", async (c) =>
    c.json({ hinweise: standortHinweise(await standorte.liste(c.get("konto").id)) }),
  );
  return routen;
}
