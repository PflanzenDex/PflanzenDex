import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { erstelleTokenPruefer } from "./token";

// Tokenprüfung gegen einen lokal erzeugten Schlüssel, ohne laufenden Anmeldedienst (US-ACC-01, FR-ACC-03).
const ISSUER = "http://idp.test/realms/pflanzendex";
const AUDIENCE = "pflanzendex-api";
let privat: CryptoKey;
let pruefer: ReturnType<typeof erstelleTokenPruefer>;

async function signiere(
  ansprueche: Record<string, unknown>,
  opt: { issuer?: string; audience?: string; ablauf?: string; schluessel?: CryptoKey } = {},
) {
  return new SignJWT(ansprueche)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opt.issuer ?? ISSUER)
    .setAudience(opt.audience ?? AUDIENCE)
    .setSubject("abc")
    .setIssuedAt()
    .setExpirationTime(opt.ablauf ?? "5m")
    .sign(opt.schluessel ?? privat);
}

beforeAll(async () => {
  const paar = await generateKeyPair("RS256");
  privat = paar.privateKey;
  const jwk: JWK = { ...(await exportJWK(paar.publicKey)), kid: "k1", alg: "RS256" };
  pruefer = erstelleTokenPruefer({
    issuer: ISSUER,
    audience: AUDIENCE,
    schluessel: createLocalJWKSet({ keys: [jwk] }),
  });
});

describe("Token prüfen (US-ACC-01)", () => {
  it("akzeptiert ein gültiges Token und liefert die Ansprüche", async () => {
    const a = await pruefer(await signiere({ email: "a@b.test" }));
    expect(a?.["sub"]).toBe("abc");
    expect(a?.["email"]).toBe("a@b.test");
  });

  it("weist ein Token mit falschem Aussteller ab", async () => {
    expect(await pruefer(await signiere({}, { issuer: "http://evil.test" }))).toBeNull();
  });

  it("weist ein Token für ein anderes Ziel (Audience) ab", async () => {
    expect(await pruefer(await signiere({}, { audience: "andere-api" }))).toBeNull();
  });

  it("weist ein abgelaufenes Token ab", async () => {
    const t = await signiere({}, { ablauf: "-1m" });
    expect(await pruefer(t)).toBeNull();
  });

  it("weist ein mit fremdem Schlüssel signiertes Token ab", async () => {
    const fremd = await generateKeyPair("RS256");
    expect(await pruefer(await signiere({}, { schluessel: fremd.privateKey }))).toBeNull();
  });

  it("weist Unsinn und unsignierte Token ab", async () => {
    expect(await pruefer("kein-token")).toBeNull();
    const ohne = `${btoa('{"alg":"none"}')}.${btoa(`{"iss":"${ISSUER}","aud":"${AUDIENCE}","sub":"x"}`)}.`;
    expect(await pruefer(ohne)).toBeNull();
  });
});
