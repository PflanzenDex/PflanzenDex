import { randomUUID } from "node:crypto";
import { failed, ok } from "@pflanzendex/core";
import { migrate, openOwnerPool } from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

// US-KI-05: the server checks an image address for the AI client (real PostgreSQL, `make db-up`).
let pool: Pool;
let app: ReturnType<typeof createApp>;
const sub = `ki5-${randomUUID()}`;
const CLIENT = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const FILE = "https://commons.wikimedia.org/wiki/File:Monstera_deliciosa.jpg";
const requests: unknown[] = [];
const data = {
  query: {
    pages: {
      "1": {
        imageinfo: [
          {
            url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Monstera_deliciosa.jpg",
            descriptionurl: FILE,
            extmetadata: { LicenseShortName: { value: "CC BY 4.0" } },
          },
        ],
      },
    },
  },
};
const get = async (token: string, url: string) => {
  const res = await app.request(`/mcp/image-source?url=${encodeURIComponent(url)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const ai = (scope: string) => `ai|${sub}|${CLIENT}|${scope}`;

beforeAll(async () => {
  pool = openOwnerPool();
  await migrate(pool);
  app = createApp({
    reviewer: async (t) =>
      t.startsWith("valid:")
        ? { sub: t.slice(6), email: "x@example.test", name: "T", email_verified: true }
        : null,
    pool,
    wishImage: {
      sources: {
        get: async (r) => {
          requests.push(r);
          return r.query?.["titles"] === "File:Missing.jpg"
            ? ok({ kind: "not_found", provenance: {}, cached: false } as never)
            : ok({ kind: "found", data, provenance: {}, cached: false } as never);
        },
      },
      download: { get: async () => failed({ code: "source.unavailable" } as never) },
    },
    ai: {
      verifier: async (t) => {
        const [kind, s, client, scope] = t.split("|");
        return kind === "ai"
          ? {
              sub: s,
              email: `${s}@example.test`,
              name: "T",
              email_verified: true,
              azp: client,
              scope: scope?.replace(/\+/g, " "),
            }
          : null;
      },
      resource: "https://pflanzendex.example/mcp",
      issuer: "https://login.example/realms/p",
    },
  });
  await app.request("/account", { headers: { authorization: `Bearer valid:${sub}` } });
});
afterAll(async () => {
  await pool.query("delete from account where subject = $1", [sub]);
  await pool.end();
});

describe("US-KI-05 check_image_source", () => {
  it("US-KI-05 the read right gets license and source found by the server", async () => {
    const r = await get(ai("pflanzen:read"), FILE);
    expect(r).toEqual({
      status: 200,
      body: { checked: true, license: "CC BY 4.0", source: FILE },
    });
  });

  it("US-KI-05 a missing file and a foreign host are refused with a code, a foreign host is never contacted", async () => {
    const missing = await get(
      ai("pflanzen:read"),
      "https://commons.wikimedia.org/wiki/File:Missing.jpg",
    );
    expect(missing.status).toBe(404);
    expect(missing.body["error"] ?? missing.body["code"]).toBeDefined();
    const before = requests.length;
    const foreign = await get(ai("pflanzen:read"), "https://evil.example/a.jpg");
    expect(JSON.stringify(foreign.body)).toContain("wish.image_source_unsupported");
    expect(requests).toHaveLength(before);
  });

  it("US-KI-05 without a token the route is closed", async () => {
    expect((await get("nope", FILE)).status).toBe(401);
  });
});
