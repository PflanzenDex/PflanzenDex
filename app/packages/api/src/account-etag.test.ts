import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "./app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// NFR-12 (issue 1244): the real app with the real guard and two accounts (`make db-up`). The answers of an account are
// conditional by their ETag, and the ETag of one account never answers another.
let pool: Pool;
let admin: Pool; // superuser fixture pool: cleanup only (QG-D1)
const subA = `nfr12-a-${randomUUID()}`;
const subB = `nfr12-b-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;

const send = (
  sub: string | null,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
) =>
  app.request(path, {
    method,
    headers: {
      ...(sub ? { authorization: `Bearer valid:${sub}` } : {}),
      ...(method === "GET"
        ? {}
        : { "content-type": "application/json", "idempotency-key": randomUUID() }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const count = (sub: string, headers: Record<string, string> = {}) =>
  send(sub, "GET", "/specimens/count", headers);
const etagOf = (res: Response) => res.headers.get("etag") ?? "";

async function newSpecies(sub: string, latinName: string): Promise<string> {
  const res = await send(
    sub,
    "POST",
    "/species",
    {},
    {
      latinName,
      germanName: latinName,
      difficulty: 2,
      standardLevel: 2,
      lightDemandLux: 15000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
    },
  );
  const body = (await res.json()) as { id?: string; error?: unknown };
  expect(res.status, JSON.stringify(body)).toBe(201);
  return body.id ?? "";
}

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
});
afterAll(async () => {
  await admin.query(
    "delete from specimen where account_id in (select id from account where subject = any($1))",
    [[subA, subB]],
  );
  await admin.query(
    `delete from species where id in (select object_id from review_case
       where account_id in (select id from account where subject = any($1)))`,
    [[subA, subB]],
  );
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
  await admin.end();
});

describe("NFR-12 conditional answers across two accounts", () => {
  it("NFR-12 the other account never gets a 304 for the ETag of the first, even when both answers are equal", async () => {
    const a = await count(subA);
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual({ count: 0, archived: 0 });
    const etagA = etagOf(a);
    expect(etagA).not.toBe("");

    const b = await count(subB, { "if-none-match": etagA });
    expect(b.status).toBe(200);
    expect(await b.json()).toEqual({ count: 0, archived: 0 });
    expect(etagOf(b)).not.toBe(etagA);

    expect((await count(subA, { "if-none-match": etagA })).status).toBe(304);
  });

  it("NFR-12 a new plant changes the count, so the ETag from before it answers 200 with the new count", async () => {
    const before = await count(subA);
    const etagBefore = etagOf(before);
    // a Latin name with letters only (the species check refuses digits)
    const letters = [...randomUUID().replace(/-/g, "")]
      .map((c) => "abcdefghijklmnop"[Number.parseInt(c, 16)])
      .join("");
    const speciesId = await newSpecies(subA, `Probus ${letters}`);
    const created = await send(
      subA,
      "POST",
      "/specimens",
      {},
      {
        timeZone: "Europe/Berlin",
        speciesId,
        marker: "Fensterbank",
      },
    );
    const createdBody = (await created.json()) as { id?: string; error?: unknown };
    expect(created.status, JSON.stringify(createdBody)).toBe(201);
    const after = await count(subA, { "if-none-match": etagBefore });
    expect(after.status).toBe(200);
    expect(await after.json()).toEqual({ count: 1, archived: 0 });
    expect(etagOf(after)).not.toBe(etagBefore);
  });

  it("NFR-12 the answer of the account is private: no shared cache rule, the token in the vary", async () => {
    const res = await count(subB);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(res.headers.get("vary")).toContain("Authorization");
  });

  it("NFR-12 a request without a token gets 401 and no ETag", async () => {
    const res = await send(null, "GET", "/specimens/count");
    expect(res.status).toBe(401);
    expect(res.headers.get("etag")).toBeNull();
  });
});
