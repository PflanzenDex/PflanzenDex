import { darfMitFreundenTeilen, kontoAusAnspruechen } from "@pflanzendex/core";
import { findeOderLegeKonto } from "@pflanzendex/db";
import type { MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import type { AuthEnv } from "../../kern";
import type { TokenPruefer } from "./token";

const nichtAngemeldet = (c: Parameters<MiddlewareHandler>[0]) =>
  c.json({ fehler: { code: "nicht_angemeldet" } }, 401, {
    // Bewusst ohne Fehlergrund (error="invalid_token" o. Ä.): Fehlschläge verraten nichts über Konten.
    "WWW-Authenticate": "Bearer",
  });

/**
 * Verlangt ein gültiges Bearer-Token, legt bei der ersten Anmeldung das Konto an (eigener Weg über das Subjekt)
 * und stellt die Konto-Kennung für die Anfrage bereit. Datenzugriffe laufen danach nur über `mitKonto` (P-03, P-04).
 */
export function authentifizierung(pruefer: TokenPruefer, pool: Pool): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const kopf = c.req.header("authorization") ?? "";
    const token = /^Bearer\s+(\S+)$/i.exec(kopf)?.[1];
    if (!token) return nichtAngemeldet(c);
    const ansprueche = await pruefer(token);
    const daten = ansprueche && kontoAusAnspruechen(ansprueche);
    if (!daten) return nichtAngemeldet(c);
    const id = await findeOderLegeKonto(pool, daten.subjekt);
    c.set("konto", { id, daten });
    await next();
  };
}

/** Teilen mit Freunden gibt es erst mit bestätigter E-Mail-Adresse (US-ACC-01). */
export const nurMitBestaetigterEmail: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (!darfMitFreundenTeilen(c.get("konto").daten))
    return c.json({ fehler: { code: "email_unbestaetigt" } }, 403);
  await next();
};
