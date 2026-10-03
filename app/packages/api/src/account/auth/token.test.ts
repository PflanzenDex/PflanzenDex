import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createTokenVerifier } from "./token";

// Token verification against a locally generated key, without a running sign-in service (US-ACC-01, FR-ACC-03).
const ISSUER = "http://idp.test/realms/pflanzendex";
const AUDIENCE = "pflanzendex-api";
let privateKey: CryptoKey;
let reviewer: ReturnType<typeof createTokenVerifier>;

async function sign(
  claims: Record<string, unknown>,
  opt: { issuer?: string; audience?: string; expiry?: string; key?: CryptoKey } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opt.issuer ?? ISSUER)
    .setAudience(opt.audience ?? AUDIENCE)
    .setSubject("abc")
    .setIssuedAt()
    .setExpirationTime(opt.expiry ?? "5m")
    .sign(opt.key ?? privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
  reviewer = createTokenVerifier({
    issuer: ISSUER,
    audience: AUDIENCE,
    key: createLocalJWKSet({ keys: [jwk] }),
  });
});

describe("verify token (US-ACC-01)", () => {
  it("accepts a valid token and returns the claims", async () => {
    const a = await reviewer(await sign({ email: "a@b.test" }));
    expect(a?.["sub"]).toBe("abc");
    expect(a?.["email"]).toBe("a@b.test");
  });

  it("rejects a token with the wrong issuer", async () => {
    expect(await reviewer(await sign({}, { issuer: "http://evil.test" }))).toBeNull();
  });

  it("rejects a token for another audience", async () => {
    expect(await reviewer(await sign({}, { audience: "other-api" }))).toBeNull();
  });

  it("rejects an expired token", async () => {
    const t = await sign({}, { expiry: "-1m" });
    expect(await reviewer(t)).toBeNull();
  });

  it("rejects a token signed with a foreign key", async () => {
    const foreign = await generateKeyPair("RS256");
    expect(await reviewer(await sign({}, { key: foreign.privateKey }))).toBeNull();
  });

  it("rejects nonsense and unsigned tokens", async () => {
    expect(await reviewer("no-token")).toBeNull();
    const without = `${btoa('{"alg":"none"}')}.${btoa(`{"iss":"${ISSUER}","aud":"${AUDIENCE}","sub":"x"}`)}.`;
    expect(await reviewer(without)).toBeNull();
  });
});
