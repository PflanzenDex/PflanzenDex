import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openPool } from "@pflanzendex/db";
import { createApp } from "../app";
import { onlyWithConfirmedEmail, type TokenVerifier } from "./index";

// US-ACC-01: the API verifies the token and sets the account per request (withAccount). Database: `make db-up`.
let pool: Pool;
const sub1 = `api-${randomUUID()}`;
const sub2 = `api-${randomUUID()}`;

// Instead of the sign-in service: "valid:<sub>:<verified>" is a valid token (the verification itself is tested by token.test.ts).
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub, verified] = token.split(":");
  if (kind !== "valid") return null;
  return {
    sub,
    email: `${sub}@example.test`,
    name: "Lena Test",
    email_verified: verified === "yes",
  };
};
const using = (token?: string) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} });
type AccountResponse = { id: string; email: string };
const account = async (app: ReturnType<typeof createApp>, init: object) =>
  (await (await app.request("/account", init)).json()) as AccountResponse & Record<string, unknown>;

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
});
afterAll(async () => {
  await pool.query("delete from account where subject = any($1)", [[sub1, sub2]]);
  await pool.end();
});

describe("GET /account (US-ACC-01)", () => {
  it("without token: 401 without a hint about the reason", async () => {
    const res = await createApp({ reviewer, pool }).request("/account");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Bearer/);
    expect(await res.json()).toEqual({ error: { code: "not_signed_in" } });
  });

  it("with invalid token: 401", async () => {
    const res = await createApp({ reviewer, pool }).request("/account", using("kaputt"));
    expect(res.status).toBe(401);
  });

  it("creates the account with account data on the first request and returns it", async () => {
    const app = createApp({ reviewer, pool });
    const res = await app.request("/account", using(`valid:${sub1}:no`));
    expect(res.status).toBe(200);
    const k = (await res.json()) as AccountResponse;
    expect(k).toMatchObject({
      email: `${sub1}@example.test`,
      displayName: "Lena Test",
      emailConfirmed: false,
      mayShareWithFriends: false,
    });
    const second = await account(app, using(`valid:${sub1}:no`));
    expect(second.id).toBe(k.id);
  });

  it("takes the email confirmation from the token", async () => {
    const app = createApp({ reviewer, pool });
    const before = await account(app, using(`valid:${sub2}:no`));
    const after = await account(app, using(`valid:${sub2}:yes`));
    expect(after.id).toBe(before.id);
    expect(after).toMatchObject({ emailConfirmed: true, mayShareWithFriends: true });
  });

  it("each person sees only their own account", async () => {
    const app = createApp({ reviewer, pool });
    const a = await account(app, using(`valid:${sub1}:no`));
    const b = await account(app, using(`valid:${sub2}:yes`));
    expect(a.id).not.toBe(b.id);
    expect(a.email).not.toBe(b.email);
  });

  it("/health stays reachable without sign-in", async () => {
    const res = await createApp({ reviewer, pool }).request("/health");
    expect(res.status).toBe(200);
  });
});

describe("sharing with friends only with a confirmed email address (US-ACC-01)", () => {
  function app() {
    const a = createApp({ reviewer, pool });
    a.post("/account/test-share", onlyWithConfirmedEmail, (c) => c.json({ shared: true }));
    return a;
  }

  it("unconfirmed: 403 with a clear next action", async () => {
    const res = await app().request("/account/test-share", {
      method: "POST",
      ...using(`valid:${sub1}:no`),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "email_unbestaetigt" } });
  });

  it("confirmed: allowed", async () => {
    const res = await app().request("/account/test-share", {
      method: "POST",
      ...using(`valid:${sub2}:yes`),
    });
    expect(res.status).toBe(200);
  });
});

describe("US-ACC-02: Profile and settings", () => {
  function app() {
    return createApp({ reviewer, pool });
  }

  it("GET /account/profile: returns profile settings", async () => {
    const res = await app().request("/account/profile", {
      ...using(`valid:${sub1}:yes`),
    });
    expect(res.status).toBe(200);
    const profile = await res.json();
    expect(profile).toHaveProperty("displayName");
    expect(profile).toHaveProperty("timeZone");
    expect(profile).toHaveProperty("everythingPrivate");
    expect(profile).toHaveProperty("noRecommendations");
  });

  it("GET /account/profile: 401 without authentication", async () => {
    const res = await app().request("/account/profile");
    expect(res.status).toBe(401);
  });

  it("PUT /account/profile: updates display name", async () => {
    const auth = using(`valid:${sub1}:yes`);
    const res = await app().request("/account/profile", {
      method: "PUT",
      body: JSON.stringify({ displayName: "Test User" }),
      headers: {
        ...auth.headers,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(200);
    const profile = (await res.json()) as Record<string, unknown>;
    expect(profile.displayName).toBe("Test User");
  });

  it("PUT /account/profile: updates time zone", async () => {
    const auth = using(`valid:${sub1}:yes`);
    const res = await app().request("/account/profile", {
      method: "PUT",
      body: JSON.stringify({ timeZone: "Europe/Berlin" }),
      headers: {
        ...auth.headers,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(200);
    const profile = (await res.json()) as Record<string, unknown>;
    expect(profile.timeZone).toBe("Europe/Berlin");
  });

  it("PUT /account/profile: rejects invalid time zone", async () => {
    const auth = using(`valid:${sub1}:yes`);
    const res = await app().request("/account/profile", {
      method: "PUT",
      body: JSON.stringify({ timeZone: "Invalid/Zone" }),
      headers: {
        ...auth.headers,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(400);
    const error = (await res.json()) as Record<string, unknown>;
    expect((error.error as Record<string, unknown>).code).toBe("input.invalid");
  });

  it("PUT /account/profile: updates privacy switches", async () => {
    const auth = using(`valid:${sub1}:yes`);
    const res = await app().request("/account/profile", {
      method: "PUT",
      body: JSON.stringify({ everythingPrivate: true, noRecommendations: true }),
      headers: {
        ...auth.headers,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(200);
    const profile = (await res.json()) as Record<string, unknown>;
    expect(profile.everythingPrivate).toBe(true);
    expect(profile.noRecommendations).toBe(true);
  });

  it("PUT /account/profile: 401 without authentication", async () => {
    const res = await app().request("/account/profile", {
      method: "PUT",
      body: JSON.stringify({ displayName: "Test" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("PUT /account/profile: two accounts isolated", async () => {
    // Account 1 updates
    const auth1 = using(`valid:${sub1}:yes`);
    const res1 = await app().request("/account/profile", {
      method: "PUT",
      body: JSON.stringify({ displayName: "Account One" }),
      headers: {
        ...auth1.headers,
        "Content-Type": "application/json",
      },
    });
    expect(res1.status).toBe(200);

    // Account 2 retrieves - should not see account 1's data
    const res2 = await app().request("/account/profile", {
      ...using(`valid:${sub2}:yes`),
    });
    expect(res2.status).toBe(200);
    const profile2 = (await res2.json()) as Record<string, unknown>;
    expect(profile2.displayName).not.toBe("Account One");
  });

  it("PUT /account/profile: rejects empty display name", async () => {
    const auth = using(`valid:${sub1}:yes`);
    const res = await app().request("/account/profile", {
      method: "PUT",
      body: JSON.stringify({ displayName: "" }),
      headers: {
        ...auth.headers,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(400);
    const error = (await res.json()) as Record<string, unknown>;
    expect((error.error as Record<string, unknown>).code).toBe("input.invalid");
  });

  it("PUT /account/profile: clears display name with null", async () => {
    const auth = using(`valid:${sub1}:yes`);
    const res = await app().request("/account/profile", {
      method: "PUT",
      body: JSON.stringify({ displayName: null }),
      headers: {
        ...auth.headers,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(200);
    const profile = (await res.json()) as Record<string, unknown>;
    expect(profile.displayName).toBeNull();
  });
});
