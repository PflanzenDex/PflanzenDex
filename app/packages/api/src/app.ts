import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Pool } from "pg";
import { produktTitel } from "@pflanzendex/core";
import { authentifizierung } from "./auth/middleware";
import type { TokenPruefer } from "./auth/token";
import { ARTEN_PFADE, artenRouten } from "./arten-routen";
import { kontoRouten } from "./konto-routen";
import { LICHT_PFADE, lichtRouten } from "./licht-routen";

export type AppOptionen = {
  /** Prüft Access-Tokens des Anmeldedienstes; ohne Angabe gibt es keine geschützten Routen. */
  pruefer?: TokenPruefer;
  pool?: Pool;
  /** Ursprung der Web-App für CORS (die API setzt keine Cookies, die Anmeldung läuft per Bearer-Token). */
  webUrsprung?: string;
  /** Kurzer Commit-Hash des laufenden Stands (aus dem Build, nicht geheim). */
  version?: string | undefined;
};

export function createApp(opt: AppOptionen = {}): Hono {
  const version = opt.version ?? "unbekannt";
  const app = new Hono();
  if (opt.webUrsprung)
    app.use(
      "*",
      cors({
        origin: opt.webUrsprung,
        allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
      }),
    );
  app.get("/health", (c) => c.json({ status: "ok", produkt: produktTitel(), version }));
  if (opt.pruefer && opt.pool) {
    const auth = authentifizierung(opt.pruefer, opt.pool);
    app.use("/konto", auth);
    app.use("/konto/*", auth);
    app.route("/konto", kontoRouten(opt.pool));
    for (const pfad of LICHT_PFADE) app.use(pfad, auth).use(`${pfad}/*`, auth);
    app.route("/", lichtRouten(opt.pool));
    for (const pfad of ARTEN_PFADE) app.use(pfad, auth).use(`${pfad}/*`, auth);
    app.route("/", artenRouten(opt.pool));
  }
  return app;
}
