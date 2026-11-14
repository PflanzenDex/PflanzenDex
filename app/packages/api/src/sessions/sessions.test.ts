import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_OPERATION_CLASSES, ERROR_TEXTS, type IdentitySessions } from "@pflanzendex/core";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";
import type { IdentityAdminConfig } from "../identity";
import { identitySessionsFromEnv, keycloakSessionsEnding } from "./keycloak-sessions";

// US-ACC-01 (issue 2065): sign out on all devices through the API. The sign-in service is a fake fetch; the database is real.
type TokenVerifier = NonNullable<AppOptions["reviewer"]>;
const SECRET = "s3cret-sessions-never-logged";
const config: IdentityAdminConfig = {
  adminUrl: "http://keycloak.test/admin/realms/pflanzendex",
  tokenUrl: "http://keycloak.test/realms/pflanzendex/protocol/openid-connect/token",
  clientId: "pflanzendex-identity",
  clientSecret: SECRET,
};
const full = {
  IDENTITY_ADMIN_URL: config.adminUrl,
  IDENTITY_TOKEN_URL: config.tokenUrl,
  IDENTITY_ADMIN_CLIENT_ID: config.clientId,
  IDENTITY_ADMIN_CLIENT_SECRET: SECRET,
};

const subA = `acc1s-${randomUUID()}`;
const subB = `acc1s-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};

/** A fake service: the token answer and the logout answer are chosen per test; every call is recorded. */
function fakeService(logout: () => Response | Error, token: () => Response | Error = tokenOk) {
  const calls: { url: string; method: string }[] = [];
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    const answer = String(url) === config.tokenUrl ? token() : logout();
    if (answer instanceof Error) throw answer;
    return answer;
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}
const tokenOk = () =>
  new Response(JSON.stringify({ access_token: "service-token" }), { status: 200 });
const answer = (status: number) => () => new Response(null, { status });
const logoutCalls = (calls: { url: string; method: string }[]) =>
  calls.filter((c) => c.url.endsWith("/logout"));

let pool: Pool;
let admin: Pool;

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await admin.end();
  await pool.end();
});

/** The app with the given sessions port; without one it is the server without settings (503). */
function appWith(identitySessions?: IdentitySessions) {
  return createApp({
    reviewer,
    pool,
    ...(identitySessions ? { identitySessions } : {}),
  });
}

type Json = { ended?: true; error?: { code: string; text: string } };

async function signOut(
  app: ReturnType<typeof createApp>,
  sub: string | null,
  body?: unknown,
  key = randomUUID(),
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "idempotency-key": key,
  };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  const res = await app.request("/account/sessions/end", {
    method: "POST",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Json };
}

describe("US-ACC-01 sign out on all devices ends the sessions of the keeper", () => {
  it("US-ACC-01 logs out the own subject with the service token and nothing else, then answers ended", async () => {
    const { calls, fetchFn } = fakeService(answer(204));
    const app = appWith(identitySessionsFromEnv(full, () => undefined, fetchFn));
    const r = await signOut(app, subA);
    expect(r).toEqual({ status: 200, body: { ended: true } });
    expect(calls).toEqual([
      { url: config.tokenUrl, method: "POST" },
      { url: `${config.adminUrl}/users/${subA}/logout`, method: "POST" },
    ]);
  });

  it("US-ACC-01 the subject comes from the verified token only: a body that names another subject changes nothing", async () => {
    const { calls, fetchFn } = fakeService(answer(204));
    const app = appWith(identitySessionsFromEnv(full, () => undefined, fetchFn));
    await signOut(app, subA, { subject: subB });
    expect(logoutCalls(calls).map((c) => c.url)).toEqual([
      `${config.adminUrl}/users/${subA}/logout`,
    ]);
  });

  it("US-ACC-01 a keeper whose user is already gone (404) counts as ended, and so does a 200", async () => {
    for (const status of [404, 200]) {
      const { fetchFn } = fakeService(answer(status));
      const app = appWith(identitySessionsFromEnv(full, () => undefined, fetchFn));
      expect((await signOut(app, subA)).status).toBe(200);
    }
  });

  it("US-ACC-01 another answer of the service, a refused token or an unreachable service is 502 failed, never ended", async () => {
    const cases: [string, () => Response | Error, () => Response | Error][] = [
      ["a refused logout (403)", answer(403), tokenOk],
      ["a failing logout (500)", answer(500), tokenOk],
      ["a refused token request", answer(500), () => new Response("no", { status: 401 })],
      ["an unreachable service", () => new Error("connect ECONNREFUSED"), tokenOk],
    ];
    for (const [, logout, token] of cases) {
      const lines: string[] = [];
      const { fetchFn } = fakeService(logout, token);
      const app = appWith(keycloakSessionsEnding(config, fetchFn, (line) => lines.push(line)));
      const r = await signOut(app, subA);
      expect(r.status).toBe(502);
      expect(r.body.error).toEqual({
        code: "account.sign_out_everywhere_failed",
        text: ERROR_TEXTS["account.sign_out_everywhere_failed"],
      });
      expect(JSON.stringify(r.body)).not.toContain(SECRET);
      expect(lines.join("\n")).not.toContain(SECRET);
      expect(lines.join("\n")).not.toContain(subA);
    }
  });

  it("US-ACC-01 without the four service settings it answers 503 unavailable and calls nothing", async () => {
    const r = await signOut(appWith(), subA);
    expect(r.status).toBe(503);
    expect(r.body.error?.code).toBe("account.sign_out_everywhere_unavailable");
    const { calls, fetchFn } = fakeService(answer(204));
    const unset = appWith(identitySessionsFromEnv({}, () => undefined, fetchFn));
    expect((await signOut(unset, subA)).status).toBe(503);
    expect(calls).toEqual([]);
  });

  it("US-ACC-01 a partial setting names the missing variable in the log, never a value, and answers 503", async () => {
    const partial: Record<string, string> = { ...full };
    delete partial["IDENTITY_ADMIN_CLIENT_SECRET"];
    const lines: string[] = [];
    const { calls, fetchFn } = fakeService(answer(204));
    const app = appWith(identitySessionsFromEnv(partial, (line) => lines.push(line), fetchFn));
    expect((await signOut(app, subA)).status).toBe(503);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("IDENTITY_ADMIN_CLIENT_SECRET");
    expect(lines.join("\n")).not.toContain(SECRET);
    expect(calls).toEqual([]);
  });

  it("US-ACC-01 without sign-in the route answers 401 and calls nothing", async () => {
    const { calls, fetchFn } = fakeService(answer(204));
    const app = appWith(identitySessionsFromEnv(full, () => undefined, fetchFn));
    expect((await signOut(app, null)).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("US-ACC-01 the same Idempotency-Key ends the sessions once and repeats the answer", async () => {
    const { calls, fetchFn } = fakeService(answer(204));
    const app = appWith(identitySessionsFromEnv(full, () => undefined, fetchFn));
    const key = randomUUID();
    const first = await signOut(app, subA, undefined, key);
    const second = await signOut(app, subA, undefined, key);
    expect(second).toEqual(first);
    expect(logoutCalls(calls)).toHaveLength(1);
  });

  it("US-ACC-01 signing out on all devices is not released to AI connections", () => {
    expect(AI_OPERATION_CLASSES["account.sign_out_everywhere"]).toBeUndefined();
    expect(AI_OPERATION_CLASSES["sign_out_everywhere"]).toBeUndefined();
  });
});
