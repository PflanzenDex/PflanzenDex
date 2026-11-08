import { describe, expect, it } from "vitest";
import { identityKept } from "@pflanzendex/core";
import {
  identityAdminConfigFromEnv,
  identityRemovalFromEnv,
  type IdentityAdminConfig,
} from "./identity-config";
import { keycloakIdentityRemoval } from "./keycloak-identity";

// US-ACC-04 (issue 1673): the identity removal at the sign-in service. The fake fetch answers; no real service is called.
const SECRET = "s3cret-value-never-logged";
const config: IdentityAdminConfig = {
  adminUrl: "http://keycloak.test/admin/realms/pflanzendex",
  tokenUrl: "http://keycloak.test/realms/pflanzendex/protocol/openid-connect/token",
  clientId: "pflanzendex-identity",
  clientSecret: SECRET,
};
type Call = { url: string; method: string; headers: Record<string, string>; body: string };

/** A fake fetch: the token answer and the delete answer are chosen per test; every call is recorded. */
function fakeFetch(
  token: Response | Error,
  remove: Response | Error = new Response(null, { status: 204 }),
) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    const isToken = String(url) === config.tokenUrl;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: String(init?.body ?? ""),
    });
    const answer = isToken ? token : remove;
    if (answer instanceof Error) throw answer;
    return answer;
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}
const tokenOk = () =>
  new Response(JSON.stringify({ access_token: "service-token" }), { status: 200 });

describe("US-ACC-04 the identity removal at the sign-in service", () => {
  it("US-ACC-04 deletes the user by its subject with a service token and answers removed", async () => {
    const { calls, fetchFn } = fakeFetch(tokenOk());
    const r = await keycloakIdentityRemoval(config, fetchFn).remove("sub-1");
    expect(r).toEqual({ ok: true, value: "removed" });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ url: config.tokenUrl, method: "POST" });
    expect(calls[0]?.body).toContain("grant_type=client_credentials");
    expect(calls[1]).toMatchObject({
      url: `${config.adminUrl}/users/sub-1`,
      method: "DELETE",
      headers: { authorization: "Bearer service-token" },
    });
  });

  it("US-ACC-04 a user that is already gone (404) counts as removed, so repeating is harmless", async () => {
    const { fetchFn } = fakeFetch(tokenOk(), new Response(null, { status: 404 }));
    expect(await keycloakIdentityRemoval(config, fetchFn).remove("sub-gone")).toEqual({
      ok: true,
      value: "removed",
    });
  });

  it("US-ACC-04 an admin refusal (401, 403, 500) is an error, kept for the job and never swallowed (P-10)", async () => {
    for (const status of [401, 403, 500]) {
      const { fetchFn } = fakeFetch(tokenOk(), new Response("denied", { status }));
      const r = await keycloakIdentityRemoval(config, fetchFn).remove("sub-1");
      expect(r.ok ? null : r.error.code).toBe("privacy.identity_removal_failed");
      expect(r.ok ? null : r.error.cause).toBeInstanceOf(Error);
    }
  });

  it("US-ACC-04 a refused token request is an error and no delete is sent", async () => {
    const { calls, fetchFn } = fakeFetch(new Response("bad", { status: 401 }));
    const r = await keycloakIdentityRemoval(config, fetchFn).remove("sub-1");
    expect(r.ok ? null : r.error.code).toBe("privacy.identity_removal_failed");
    expect(calls).toHaveLength(1);
  });

  it("US-ACC-04 a network failure is an error, not a removal", async () => {
    const { fetchFn } = fakeFetch(new Error("connect ECONNREFUSED"));
    const r = await keycloakIdentityRemoval(config, fetchFn).remove("sub-1");
    expect(r.ok ? null : r.error.code).toBe("privacy.identity_removal_failed");
  });

  it("US-ACC-04 the subject is put into the path as one segment", async () => {
    const { calls, fetchFn } = fakeFetch(tokenOk());
    await keycloakIdentityRemoval(config, fetchFn).remove("a/b?c");
    expect(calls[1]?.url).toBe(`${config.adminUrl}/users/a%2Fb%3Fc`);
  });
});

describe("US-ACC-04 the identity removal is configured by four variables, all or none", () => {
  const full = {
    IDENTITY_ADMIN_URL: config.adminUrl,
    IDENTITY_TOKEN_URL: config.tokenUrl,
    IDENTITY_ADMIN_CLIENT_ID: config.clientId,
    IDENTITY_ADMIN_CLIENT_SECRET: SECRET,
  };

  it("US-ACC-04 none set: no configuration, the stub keeps the subject open", async () => {
    expect(identityAdminConfigFromEnv({})).toBeNull();
    const logged: string[] = [];
    const removal = identityRemovalFromEnv({}, (line) => logged.push(line));
    expect(removal).toBe(identityKept);
    expect(logged).toEqual([]);
    expect(await removal.remove("sub-1")).toEqual({ ok: true, value: "pending" });
  });

  it("US-ACC-04 a partial set keeps the stub, names the missing variables and never a value", async () => {
    const partial: Record<string, string> = { ...full };
    delete partial["IDENTITY_ADMIN_CLIENT_SECRET"];
    const logged: string[] = [];
    const removal = identityRemovalFromEnv(partial, (line) => logged.push(line));
    expect(removal).toBe(identityKept);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("IDENTITY_ADMIN_CLIENT_SECRET");
    expect(logged.join("\n")).not.toContain(SECRET);
  });

  it("US-ACC-04 a URL that is not a URL counts as missing", () => {
    expect(identityAdminConfigFromEnv({ ...full, IDENTITY_ADMIN_URL: "not a url" })).toEqual([
      "IDENTITY_ADMIN_URL",
    ]);
  });

  it("US-ACC-04 all four set: the service removes the user, and the secret never reaches a log line", async () => {
    const logged: string[] = [];
    const { calls, fetchFn } = fakeFetch(tokenOk());
    const removal = identityRemovalFromEnv(full, (line) => logged.push(line), fetchFn);
    expect(await removal.remove("sub-1")).toEqual({ ok: true, value: "removed" });
    expect(calls).toHaveLength(2);
    expect(logged).toEqual([]);
    expect(JSON.stringify(calls.map((c) => c.url))).not.toContain(SECRET);
  });
});
