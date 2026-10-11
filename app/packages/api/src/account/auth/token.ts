import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type TokenVerifier = (token: string) => Promise<Record<string, unknown> | null>;

export type VerifierOptions = {
  issuer: string;
  audience: string;
  /**
   * Where to fetch the keys when that differs from the issuer's address, e.g. inside a container network while the
   * issuer is the public address (TE-03). The `iss` claim is still checked against `issuer`.
   */
  jwksUrl?: string;
  /** Key source; otherwise the sign-in service's keys (JWKS) are loaded and cached. */
  key?: JWTVerifyGetKey;
};

/**
 * Verifies signature, issuer, audience and expiry of an access token of the sign-in service (E-03, FR-ACC-03).
 * Only asymmetric algorithms are allowed, so `alg: none` and shared secrets are ruled out.
 * Every failure yields `null`; the reason is deliberately not passed on to callers.
 */
export function createTokenVerifier(opt: VerifierOptions): TokenVerifier {
  const key =
    opt.key ??
    createRemoteJWKSet(
      new URL(opt.jwksUrl ?? `${opt.issuer.replace(/\/$/, "")}/protocol/openid-connect/certs`),
    );
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, key, {
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
