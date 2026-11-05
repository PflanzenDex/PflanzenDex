import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  InMemoryObjectStore,
  appError,
  failed,
  ok,
  thumbnailName,
  type ImageDownload,
  type SourceClient,
} from "@pflanzendex/core";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "./app";
import { createSharpProcessor } from "./media";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// NFR-12, US-WUN-04, P-05 (issue 1289): a wish image goes through the real processing (sharp) and is stored as WebP with
// its thumbnail, without the GPS of the original. Real PostgreSQL and in-memory object store; the Commons sources and the
// download are fakes, so there is no network. The route itself is covered by wishlist/wish-image-routes.test.ts.
let pool: Pool;
let admin: Pool;
const sub = `wun4w-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, who] = token.split(":");
  return kind === "valid"
    ? { sub: who, email: `${who}@example.test`, name: "Test", email_verified: true }
    : null;
};
const FILE = "https://commons.wikimedia.org/wiki/File:Monstera_deliciosa.jpg";
const UPLOAD = "https://upload.wikimedia.org/wikipedia/commons/a/ab/Monstera_deliciosa.jpg";
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
                    LicenseShortName: { value: "CC BY-SA 4.0" },
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
let app: ReturnType<typeof createApp>;
const store = new InMemoryObjectStore();

async function call(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {
    authorization: `Bearer valid:${sub}`,
    "content-type": "application/json",
  };
  if (method !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, body: text.startsWith("{") ? JSON.parse(text) : {} };
}

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({
    reviewer,
    pool,
    media: { store, processor: createSharpProcessor() },
    wishImage: {
      sources,
      download: {
        get: async (url) =>
          url === UPLOAD
            ? ok({ bytes: await original(), contentType: "image/jpeg" })
            : failed(appError("wish.image_source_unsupported")),
      } satisfies ImageDownload,
    },
  });
});
afterAll(async () => {
  await admin.query("delete from account where subject = $1", [sub]);
  await pool.end();
  await admin.end();
});

/** An original photo as Commons has it: a JPEG with GPS in its EXIF. */
const original = () =>
  sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#2a7a3a" } })
    .jpeg()
    .withExif({
      IFD0: { Make: "TestCam" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "51/1 30/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "7/1 0/1 0/1",
      },
    })
    .toBuffer();

describe("NFR-12 US-WUN-04 a stored wish image is WebP", () => {
  it("NFR-12 US-WUN-04 the stored copy is WebP without EXIF/GPS, and its 256 px thumbnail is stored next to it", async () => {
    expect((await sharp(await original()).metadata()).exif).toBeDefined(); // the original really carries EXIF
    const created = await call("POST", "/wishes", {
      name: `Echtbild ${randomUUID().slice(0, 8)}`,
      imageUrl: FILE,
      imageSource: "Wikipedia",
    });
    const id = created.body["wish"].id as string;
    const r = await call("POST", `/wishes/${id}/image`);
    expect(r.status).toBe(200);
    const row = await admin.query("select account_id, image_object from wish where id = $1", [id]);
    const { account_id: account, image_object: name } = row.rows[0] as {
      account_id: string;
      image_object: string;
    };
    expect(name).toMatch(/\.webp$/);
    const own = await app.request(`/wishes/${id}/image`, {
      headers: { authorization: `Bearer valid:${sub}` },
    });
    expect(own.headers.get("content-type")).toBe("image/webp");
    const bytes = new Uint8Array(await own.arrayBuffer());
    expect(Buffer.from(bytes.subarray(8, 12)).toString("latin1")).toBe("WEBP");
    const meta = await sharp(bytes).metadata();
    expect([meta.format, meta.exif]).toEqual(["webp", undefined]);
    expect(Buffer.from(bytes).includes("TestCam")).toBe(false);
    const small = await store.get(account, thumbnailName(name));
    if (!small.ok) throw new Error("no thumbnail stored for the wish image");
    const thumb = await sharp(small.value.bytes).metadata();
    expect([thumb.format, Math.max(thumb.width ?? 0, thumb.height ?? 0), thumb.exif]).toEqual([
      "webp",
      256,
      undefined,
    ]);
    expect(store.objectCount()).toBe(2); // the stored copy and its thumbnail, nothing else
  });
});
