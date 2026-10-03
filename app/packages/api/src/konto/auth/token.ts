import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type TokenPruefer = (token: string) => Promise<Record<string, unknown> | null>;

export type PrueferOptionen = {
  issuer: string;
  audience: string;
  /** Schlüsselquelle; sonst werden die Schlüssel des Anmeldedienstes (JWKS) geladen und zwischengespeichert. */
  schluessel?: JWTVerifyGetKey;
};

/**
 * Prüft Signatur, Aussteller, Ziel (Audience) und Ablauf eines Access-Tokens des Anmeldedienstes (E-03, FR-ACC-03).
 * Nur asymmetrische Verfahren sind erlaubt, `alg: none` und gemeinsame Geheimnisse scheiden damit aus.
 * Jeder Fehler ergibt `null`; der Grund wird bewusst nicht an Aufrufer weitergegeben.
 */
export function erstelleTokenPruefer(opt: PrueferOptionen): TokenPruefer {
  const schluessel =
    opt.schluessel ??
    createRemoteJWKSet(new URL(`${opt.issuer.replace(/\/$/, "")}/protocol/openid-connect/certs`));
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, schluessel, {
        issuer: opt.issuer,
        audience: opt.audience,
        algorithms: ["RS256", "ES256", "PS256"],
      });
      return payload;
    } catch {
      return null;
    }
  };
}
