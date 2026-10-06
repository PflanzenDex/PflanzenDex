import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openEnsuredOwnerPool, openFixturePool, withAccount } from "@pflanzendex/db";
import { createApp } from "../app";
import type { TokenVerifier } from "./index";

// US-ACC-02: profile and settings through the API. Database: `make db-up`.
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
const subA = `api-${randomUUID()}`;
const subB = `api-${randomUUID()}`;
const subNoRow = `api-${randomUUID()}`;
const subFreshPut = `api-${randomUUID()}`;
const subFreshOther = `api-${randomUUID()}`;
const subKeep = `api-${randomUUID()}`;
const subKeepOther = `api-${randomUUID()}`;

const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  if (kind !== "valid") return null;
  return { sub, email: `${sub}@example.test`, name: "Lena Test", email_verified: true };
};
const app = () => createApp({ reviewer, pool });
const as = (sub: string) => ({ authorization: `Bearer valid:${sub}` });
const profile = {
  displayName: "Anna",
  timeZone: "Europe/Berlin",
  everythingPrivate: true,
  noRecommendations: true,
  notifications: { treatment: false },
};
const put = (sub: string, body: unknown, key = randomUUID()) =>
  app().request("/account/profile", {
    method: "PUT",
    headers: { ...as(sub), "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(body),
  });
const read = async (sub: string) =>
  (await (await app().request("/account/profile", { headers: as(sub) })).json()) as Record<
    string,
    unknown
  >;

beforeAll(async () => {
  pool = await openEnsuredOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  // The web app loads the account first, which creates the data row.
  for (const sub of [subA, subB]) await app().request("/account", { headers: as(sub) });
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [
    [subA, subB, subNoRow, subFreshPut, subFreshOther, subKeep, subKeepOther],
  ]);
  await pool.end();
  await admin.end();
});

describe("US-ACC-02 · GET /account/profile", () => {
  it("401 without a token", async () => {
    expect((await app().request("/account/profile")).status).toBe(401);
  });

  it("a new account is private by default with everything on and no time zone yet", async () => {
    const p = await read(subB);
    expect(p).toEqual({
      displayName: "Lena Test",
      timeZone: null,
      everythingPrivate: false,
      noRecommendations: false,
      notifications: {
        phase: true,
        treatment: true,
        measurement: true,
        watering: true,
        swap: true,
        friends: true,
      },
    });
  });

  it("a fresh account that reads the profile first gets its row and the defaults, never 403", async () => {
    const res = await app().request("/account/profile", { headers: as(subNoRow) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      displayName: "Lena Test",
      timeZone: null,
      everythingPrivate: false,
      noRecommendations: false,
    });
  });
});

describe("US-ACC-02 · PUT /account/profile", () => {
  it("saves the whole profile and returns it; GET and GET /account show it", async () => {
    const res = await put(subA, profile);
    expect(res.status).toBe(200);
    const saved = (await res.json()) as { notifications: Record<string, boolean> };
    expect(saved).toMatchObject({ ...profile, notifications: { treatment: false, phase: true } });
    expect(await read(subA)).toEqual(saved);
    const account = await (await app().request("/account", { headers: as(subA) })).json();
    expect(account).toMatchObject({ displayName: "Anna", timeZone: "Europe/Berlin" });
  });

  it("a chosen display name survives the next sign-in; the token name is only the starting value", async () => {
    await put(subA, profile);
    await app().request("/account", { headers: as(subA) });
    expect((await read(subA))["displayName"]).toBe("Anna");
  });

  it("refuses an unknown time zone with 400, code, German text and field; nothing is saved", async () => {
    const res = await put(subB, { ...profile, timeZone: "Mars/Olympus" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: "input.invalid",
        text: "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.",
        details: [{ field: "timeZone", code: "input.invalid" }],
      },
    });
    expect((await read(subB))["timeZone"]).toBeNull();
  });

  it.each([
    [{ notifications: { unknown: true } }],
    [{ notifications: { phase: "yes" } }],
    [{ displayName: "" }],
    [{ everythingPrivate: "true" }],
  ])("refuses the invalid input %j with 400", async (extra) => {
    expect((await put(subB, { ...profile, ...extra })).status).toBe(400);
  });

  it("refuses a body that is no object", async () => {
    expect((await put(subB, [1, 2])).status).toBe(400);
  });

  it("400 idempotency.key_missing without the Idempotency-Key", async () => {
    const res = await app().request("/account/profile", {
      method: "PUT",
      headers: { ...as(subB), "content-type": "application/json" },
      body: JSON.stringify(profile),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "idempotency.key_missing",
    );
  });

  it("401 without a token and nothing written", async () => {
    const res = await app().request("/account/profile", {
      method: "PUT",
      headers: { "content-type": "application/json", "idempotency-key": randomUUID() },
      body: JSON.stringify(profile),
    });
    expect(res.status).toBe(401);
  });

  it("a fresh account that saves the profile first succeeds and the save is kept", async () => {
    const res = await put(subFreshPut, profile);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ displayName: "Anna", timeZone: "Europe/Berlin" });
    expect((await read(subFreshPut))["timeZone"]).toBe("Europe/Berlin");
  });

  it("two fresh accounts: the first save of one never shows up for the other (P-04)", async () => {
    await put(subFreshPut, { ...profile, displayName: "Fresh One" });
    const other = await read(subFreshOther);
    expect(other["displayName"]).toBe("Lena Test");
    expect(other["timeZone"]).toBeNull();
  });

  it("a repeat with the same key and values answers the same and writes once", async () => {
    const key = randomUUID();
    const first = await put(subB, { ...profile, displayName: "Ben" }, key);
    const second = await put(subB, { ...profile, displayName: "Ben" }, key);
    expect(await second.json()).toEqual(await first.json());
  });
});

describe("US-ACC-02 · a save without a display name keeps the stored one", () => {
  it.each([
    ["null", null],
    ["left out", undefined],
  ])("display name %s: 200, the name stays, the other settings are saved", async (_, name) => {
    for (const sub of [subKeep, subKeepOther])
      await app().request("/account", { headers: as(sub) });
    await put(subKeep, { ...profile, displayName: "Kept Name" });
    await put(subKeepOther, { ...profile, displayName: "Other" });
    const res = await put(subKeep, { ...profile, displayName: name, timeZone: "UTC" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ displayName: "Kept Name", timeZone: "UTC" });
    // The next sign-in does not refill the name from the token either.
    await app().request("/account", { headers: as(subKeep) });
    expect(await read(subKeep)).toMatchObject({ displayName: "Kept Name", timeZone: "UTC" });
    expect((await read(subKeepOther))["displayName"]).toBe("Other");
  });

  it("an empty display name is still refused with input.invalid on displayName", async () => {
    const res = await put(subKeep, { ...profile, displayName: "" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "input.invalid", details: [{ field: "displayName", code: "input.invalid" }] },
    });
    expect((await read(subKeep))["displayName"]).toBe("Kept Name");
  });
});

describe("US-ACC-02 · tenant isolation over HTTP (P-04)", () => {
  it("account B cannot read or change the profile of account A, even with A's id in the body", async () => {
    await put(subA, { ...profile, displayName: "Only Anna" });
    const accountA = (await (await app().request("/account", { headers: as(subA) })).json()) as {
      id: string;
    };
    await put(subB, {
      ...profile,
      displayName: "Ben",
      accountId: accountA.id,
      account_id: accountA.id,
    });
    expect((await read(subA))["displayName"]).toBe("Only Anna");
    expect((await read(subB))["displayName"]).toBe("Ben");
  });

  it("the row rule hides the row of A from B at statement level", async () => {
    const a = (await (await app().request("/account", { headers: as(subA) })).json()) as {
      id: string;
    };
    const b = (await (await app().request("/account", { headers: as(subB) })).json()) as {
      id: string;
    };
    const seen = await withAccount(pool, b.id, (c) =>
      c.query("select 1 from account_data where account_id = $1", [a.id]),
    );
    expect(seen.rowCount).toBe(0);
  });
});
