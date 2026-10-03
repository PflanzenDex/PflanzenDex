import {
  lichtzoneAendern,
  lichtzoneAnlegen,
  lichtzoneLoeschen,
  lichtzoneVoreinstellung,
  standortAendern,
  standortEinrichten,
  standortHinweise,
  zoneAbleitenGeprueft,
  type Operation,
  type ZonenNutzung,
} from "@pflanzendex/core";
import { IdempotenzPostgres, StandortePostgres, ZonenPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import {
  fehlerKoerper,
  koerper,
  schreibe as schreibeMit,
  type Antwortform,
  type AuthEnv,
  type Ctx,
} from "../kern";

/** Pfade, die der Anmeldeschutz (Bearer-Token) abdecken muss. */
export const LICHT_PFADE = ["/lichtzonen", "/standorte", "/hinweise"] as const;

async function ableitung(c: Ctx, zonen: ZonenPostgres) {
  const zahl = (name: string) => Number(c.req.query(name) ?? Number.NaN);
  const r = zoneAbleitenGeprueft(
    {
      lichtbedarfLux: zahl("lichtbedarfLux"),
      standardStufe: zahl("standardStufe"),
      weichesBlatt: c.req.query("weichesBlatt") === "true",
    },
    await zonen.liste(c.get("konto").id),
  );
  return r.ok ? c.json(r.wert) : c.json(fehlerKoerper(r.fehler), 400);
}

/**
 * Standorte und Lichtzonen (US-LIC-05). Schreibzugriffe laufen nur über die Operationen von `core`
 * (Validierung, Wiederholungsschutz per `Idempotency-Key`), Lesezugriffe über die Adapter unter `mitKonto`.
 *
 * Grenze: Arten und Exemplare (BES-02) verlinken keine Zone, brauchen also keine Quelle: ein Exemplar erreicht eine Zone
 * nur über seinen Standort, den die Standort-Quelle schon meldet. Wer als Erstes ein Feld auf eine Zone zeigen lässt
 * (Zonen-Override der Stecklinge BES-04, Pflegeprofil BES-09), liefert seine Quelle über `zusaetzlicheNutzung`.
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
    form: Omit<Antwortform<A>, "eingabe"> = {},
  ) => schreibeMit(c, deps, op, { ...form, eingabe });
  const mitId = async (c: Ctx) => ({ ...(await koerper(c)), id: c.req.param("id") });

  routen.get("/lichtzonen", async (c) => c.json({ zonen: await zonen.liste(c.get("konto").id) }));
  // US-LIC-01: Zone der Art, abgeleitet aus Lux-Bedarf und Standard-Stufe nach den Zonen des Kontos (FR-BES-10).
  routen.get("/lichtzonen/ableitung", (c) => ableitung(c, zonen));
  routen.post("/lichtzonen/voreinstellung", async (c) =>
    schreibe(
      c,
      lichtzoneVoreinstellung(zonen),
      {},
      {
        erfolg: 201,
        huelle: (zonenListe) => ({ zonen: zonenListe }),
      },
    ),
  );
  routen.post("/lichtzonen", async (c) =>
    schreibe(c, lichtzoneAnlegen(zonen), await koerper(c), { erfolg: 201 }),
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
    schreibe(c, standortEinrichten(standorte), await koerper(c), { erfolg: 201 }),
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
