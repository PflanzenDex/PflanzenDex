import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { Pool } from "pg";
import { produktTitel, type SollStandortQuelle } from "@pflanzendex/core";
import { authentifizierung, kontoRouten, type TokenPruefer } from "./konto";
import { EXEMPLARE_PFADE, exemplareRouten } from "./bestand";
import { ARTEN_PFADE, artenRouten } from "./katalog";
import { LICHT_PFADE, lichtRouten } from "./licht";
import { PFLEGE_PFADE, PFLEGEPHASEN_PFADE, pflegeRouten, pflegephasenRouten } from "./pflege";

export type AppOptionen = {
  /** Prüft Access-Tokens des Anmeldedienstes; ohne Angabe gibt es keine geschützten Routen. */
  pruefer?: TokenPruefer;
  pool?: Pool;
  /** Ursprung der Web-App für CORS (die API setzt keine Cookies, die Anmeldung läuft per Bearer-Token). */
  webUrsprung?: string;
  /** Version des laufenden Stands: `git describe --tags --always`, z. B. v0.1.0 oder v0.1.0-3-gabc1234 (aus dem Build, nicht geheim). */
  version?: string | undefined;
  /** Kurzer Commit-Hash des laufenden Stands (aus dem Build, nicht geheim). */
  commit?: string | undefined;
  /** Die Uhr für „heute“ (NFR-08); ohne Angabe die Systemzeit. */
  uhr?: () => Date;
  /** Soll-Standort für neue Exemplare; `pflege` (PHA) liefert ihn, bis dahin ist der Standort unbekannt. */
  sollStandort?: SollStandortQuelle;
};

/** Das Modul `pflege` (Messungen und Pflegephasen): Anmeldeschutz vor die Pfade, dann die Routen. */
function bindePflegeEin(app: Hono, pool: Pool, auth: MiddlewareHandler, opt: { uhr?: () => Date }) {
  for (const pfad of PFLEGE_PFADE) app.use(pfad, auth);
  app.route("/", pflegeRouten(pool, opt));
  for (const pfad of PFLEGEPHASEN_PFADE) app.use(pfad, auth).use(`${pfad}/*`, auth);
  app.route("/", pflegephasenRouten(pool, opt));
}

export function createApp(opt: AppOptionen = {}): Hono {
  const version = opt.version ?? "unbekannt";
  const commit = opt.commit ?? "unbekannt";
  const app = new Hono();
  if (opt.webUrsprung)
    app.use(
      "*",
      cors({
        origin: opt.webUrsprung,
        allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
      }),
    );
  app.get("/health", (c) => c.json({ status: "ok", produkt: produktTitel(), version, commit }));
  if (opt.pruefer && opt.pool) {
    const auth = authentifizierung(opt.pruefer, opt.pool);
    app.use("/konto", auth);
    app.use("/konto/*", auth);
    app.route("/konto", kontoRouten(opt.pool));
    for (const pfad of LICHT_PFADE) app.use(pfad, auth).use(`${pfad}/*`, auth);
    app.route("/", lichtRouten(opt.pool));
    for (const pfad of ARTEN_PFADE) app.use(pfad, auth).use(`${pfad}/*`, auth);
    app.route("/", artenRouten(opt.pool));
    for (const pfad of EXEMPLARE_PFADE) app.use(pfad, auth).use(`${pfad}/*`, auth);
    app.route(
      "/",
      exemplareRouten(opt.pool, {
        ...(opt.uhr ? { uhr: opt.uhr } : {}),
        ...(opt.sollStandort ? { sollStandort: opt.sollStandort } : {}),
      }),
    );
    bindePflegeEin(app, opt.pool, auth, opt.uhr ? { uhr: opt.uhr } : {});
  }
  return app;
}
