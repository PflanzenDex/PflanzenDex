import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  InMemoryObjectStore,
  appError,
  failed,
  ok,
  MEDIA_LIMITS,
  type ImageDownload,
  type ImageProcessor,
  type SourceClient,
} from "@pflanzendex/core";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-WUN-04: a local copy of a wish image with source and license, private to the owner (real PostgreSQL, image
// processing replaced by a stub, in-memory object store, the external sources replaced by fakes: no network).
let pool: Pool;
let admin: Pool;
const subA = `wun4-${randomUUID()}`;
const subB = `wun4-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
const FILE = "https://commons.wikimedia.org/wiki/File:Monstera_deliciosa.jpg";
const UPLOAD = "https://upload.wikimedia.org/wikipedia/commons/a/ab/Monstera_deliciosa.jpg";
const store = new InMemoryObjectStore();
let license = "CC BY-SA 4.0";
let downloads = 0;
const sources: SourceClient = {
  get: async (request) =>
    ok({
      kind: "found" as const,
      data: {
        query: {
          pages: {
            "1": {
              imageinfo: [
                {
                  url: UPLOAD,
                  descriptionurl: FILE,
                  extmetadata: {
                    LicenseShortName: { value: license },
                    Artist: { value: "Anna Beispiel" },
                  },
                },
              ],
            },
          },
        },
      },
      provenance: { source: request.source, url: "u", retrievedAt: "2026-10-09T10:00:00Z" },
      cached: false,
    }),
};
const download: ImageDownload = {
  get: async (url) => {
    downloads += 1;
    if (url !== UPLOAD) return failed(appError("wish.image_source_unsupported"));
    return ok({ bytes: new Uint8Array([0xff, 0xd8, 1, 2]), contentType: "image/jpeg" });
  },
};
// The processing itself is covered by the media tests (TE-05); here it only has to be called and its result stored.
const processor: ImageProcessor = {
  process: async (input) =>
    ok({ bytes: input, contentType: MEDIA_LIMITS.storedType, width: 40, height: 30 }),
};
let app: ReturnType<typeof createApp>;
let bare: ReturnType<typeof createApp>;
type Res = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(
  target: ReturnType<typeof createApp>,
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<Res> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  if (method !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await target.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, body: text.startsWith("{") ? JSON.parse(text) : {} };
}
const newWish = async (sub: string, name: string, imageUrl: string | null) =>
  (
    await call(app, sub, "POST", "/wishes", {
      name: `${name} ${randomUUID().slice(0, 8)}`,
      ...(imageUrl ? { imageUrl, imageSource: "Wikipedia" } : {}),
    })
  ).body["wish"].id as string;

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  const media = { store, processor };
  app = createApp({ reviewer, pool, media, wishImage: { sources, download } });
  bare = createApp({ reviewer, pool });
});
afterAll(async () => {
  await admin.query(
    "delete from wish where account_id in (select id from account where subject = any($1))",
    [[subA, subB]],
  );
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
  await admin.end();
});

describe("US-WUN-04 store the image of a wish", () => {
  it("stores a processed local copy with the verified source and license, and serves it to the owner only", async () => {
    const id = await newWish(subA, "Monstera", FILE);
    const r = await call(app, subA, "POST", `/wishes/${id}/image`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      changed: true,
      wish: { license: "CC BY-SA 4.0", imageSource: `Anna Beispiel, ${FILE}` },
    });
    const own = await app.request(`/wishes/${id}/image`, {
      headers: { authorization: `Bearer valid:${subA}` },
    });
    expect([own.status, own.headers.get("content-type")]).toEqual([200, "image/jpeg"]);
    expect(own.headers.get("cache-control")).toContain("private");
    expect(Array.from(new Uint8Array(await own.arrayBuffer()))).toEqual([0xff, 0xd8, 1, 2]);
    const foreign = await app.request(`/wishes/${id}/image`, {
      headers: { authorization: `Bearer valid:${subB}` },
    });
    expect(foreign.status).toBe(404);
    expect((await app.request(`/wishes/${id}/image`)).status).toBe(401);
  });

  it("storing again keeps the copy and fetches nothing", async () => {
    const id = await newWish(subA, "Zweimal", FILE);
    await call(app, subA, "POST", `/wishes/${id}/image`);
    const before = downloads;
    const again = await call(app, subA, "POST", `/wishes/${id}/image`);
    expect(again.body["changed"]).toBe(false);
    expect(downloads).toBe(before);
  });

  it("another host is refused with 422 and nothing is fetched or stored (no hotlink, no SSRF)", async () => {
    const id = await newWish(subA, "Fremd", "https://example.com/pflanze.jpg");
    const before = downloads;
    const r = await call(app, subA, "POST", `/wishes/${id}/image`);
    expect([r.status, r.body["error"].code]).toEqual([422, "wish.image_source_unsupported"]);
    expect(downloads).toBe(before);
  });

  it("a license that does not allow storing is refused with 422", async () => {
    const id = await newWish(subA, "Lizenz", FILE);
    license = "CC BY-NC 4.0";
    try {
      const r = await call(app, subA, "POST", `/wishes/${id}/image`);
      expect([r.status, r.body["error"].code]).toEqual([422, "wish.image_license_unsupported"]);
    } finally {
      license = "CC BY-SA 4.0";
    }
  });

  it("a wish of another account looks unknown (404) and without storage the route answers 502", async () => {
    const id = await newWish(subA, "Privat", FILE);
    expect((await call(app, subB, "POST", `/wishes/${id}/image`)).status).toBe(404);
    const r = await call(bare, subA, "POST", `/wishes/${id}/image`);
    expect([r.status, r.body["error"].code]).toEqual([502, "media.storage_unavailable"]);
  });

  it("without a token the route answers 401", async () => {
    const r = await call(app, null, "POST", `/wishes/${randomUUID()}/image`);
    expect(r.status).toBe(401);
  });
});
