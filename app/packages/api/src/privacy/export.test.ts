import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-ACC-04: the export of the caller's own data through the API (real PostgreSQL).
let pool: Pool;
let admin: Pool;
const subA = `acc4-${randomUUID()}`;
const subB = `acc4-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;
const get = (sub: string | null, path: string) =>
  app.request(path, { headers: sub ? { authorization: `Bearer valid:${sub}` } : {} });

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await admin.end();
  await pool.end();
});

describe("US-ACC-04 export through the API", () => {
  it("US-ACC-04 refuses a request without sign-in", async () => {
    expect((await get(null, "/account/export")).status).toBe(401);
  });

  it("US-ACC-04 answers a ZIP archive with data.json of the caller, and nothing of another account", async () => {
    await get(subA, "/account");
    await get(subB, "/account");
    const res = await get(subA, "/account/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain("pflanzendex-export.zip");
    expect(res.headers.get("x-missing-photos")).toBe("0");
    const zip = Buffer.from(await res.arrayBuffer());
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const text = zip.toString("utf8");
    expect(text).toContain(`${subA}@example.test`);
    expect(text).not.toContain(`${subB}@example.test`);
    expect(text).toContain("pflanzendex-export");
  });

  it("US-ACC-04 gives the same bytes twice for the same data", async () => {
    const a = Buffer.from(await (await get(subA, "/account/export")).arrayBuffer());
    const b = Buffer.from(await (await get(subA, "/account/export")).arrayBuffer());
    expect(a.equals(b)).toBe(true);
  });
});
