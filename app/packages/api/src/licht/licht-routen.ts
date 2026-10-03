import {
  fuehreAus,
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
import { Hono, type Context } from "hono";
import type { Pool } from "pg";
import type { AuthEnv } from "../kern";
import { fehlerKoerper, statusFuer } from "../kern";

/** Pfade, die der Anmeldeschutz (Bearer-Token) abdecken muss. */
export const LICHT_PFADE = ["/lichtzonen", "/standorte", "/hinweise"] as const;

type Ctx = Context<AuthEnv>;

/**
 * Standorte und Lichtzonen (US-LIC-05). Schreibzugriffe laufen nur über die Operationen von `core`
 * (Validierung, Wiederholungsschutz per `Idempotency-Key`), Lesezugriffe über die Adapter unter `mitKonto`.
 *
 * Grenze: Exemplare und Arten gibt es noch nicht (BES). `zusaetzlicheNutzung` nimmt ihre Quellen auf; bis dahin
 * prüft „Zone löschen“ nur Standorte.
 */
export function lichtRouten(
  pool: Pool,
  zusaetzlicheNutzung: readonly ZonenNutzung[] = [],
): Hono<AuthEnv> {
  const zonen = new ZonenPostgres(pool);
  const standorte = new StandortePostgres(pool);
  const deps = { idempotenz: new IdempotenzPostgres(pool) };
  const routen = new Hono<AuthEnv>();

  async function schreibe<E, A>(
    c: Ctx,
    op: Operation<E, A>,
    eingabe: unknown,
    erfolg: 200 | 201 = 200,
    huelle: (wert: A) => object = (w) => w as object,
  ) {
    const r = await fuehreAus(op, deps, {
      kontext: { nutzerId: c.get("konto").id },
      eingabe,
      idempotenzSchluessel: c.req.header("idempotency-key") || undefined,
    });
    if (!r.ok) {
      if (r.fehler.code === "system.unerwartet")
        console.error("Operation fehlgeschlagen", r.fehler.ursache);
      return c.json(fehlerKoerper(r.fehler), statusFuer(r.fehler));
    }
    return c.json(huelle(r.wert), erfolg);
  }
  const koerper = async (c: Ctx): Promise<Record<string, unknown>> => {
    const b: unknown = await c.req.json().catch(() => null);
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  };
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
