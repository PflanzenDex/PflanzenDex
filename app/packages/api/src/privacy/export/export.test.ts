import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryObjectStore } from "@pflanzendex/core";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";
import { createSharpProcessor } from "../../media";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-ACC-04: the export of the caller's own data through the API (real PostgreSQL).
let pool: Pool;
let admin: Pool;
const subA = `acc4-${randomUUID()}`;
const subB = `acc4-${randomUUID()}`;
const subP = `acc4-${randomUUID()}`; // keeps a measurement with a photo
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
  await admin.query("delete from account where subject = any($1)", [[subA, subB, subP]]);
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

/** Entries of a ZIP archive written without compression (the export): name and bytes of every local file header. */
function zipEntries(zip: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let at = 0;
  while (at + 30 <= zip.length && zip.readUInt32LE(at) === 0x04034b50) {
    const size = zip.readUInt32LE(at + 18);
    const nameLength = zip.readUInt16LE(at + 26);
    const extraLength = zip.readUInt16LE(at + 28);
    const name = zip.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const start = at + 30 + nameLength + extraLength;
    entries.set(name, zip.subarray(start, start + size));
    at = start + size;
  }
  return entries;
}

describe("NFR-12 US-ACC-04 the photos in the export are the stored WebP files", () => {
  it("NFR-12 US-ACC-04 a photo in the export is named .webp, listed as .webp in data.json and opens as a WebP image", async () => {
    const photos = new InMemoryObjectStore();
    const withPhotos = createApp({
      reviewer,
      pool,
      media: { store: photos, processor: createSharpProcessor() },
    });
    const req = (method: string, path: string, body?: unknown, type = "application/json") => {
      const init: RequestInit = {
        method,
        headers: {
          authorization: `Bearer valid:${subP}`,
          "content-type": type,
          ...(method === "GET" ? {} : { "idempotency-key": randomUUID() }),
        },
      };
      if (body !== undefined) init.body = body as NonNullable<RequestInit["body"]>;
      return withPhotos.request(path, init);
    };
    // Latin names take letters only, so the tag is letters too (as in photo-upload.test.ts).
    const tag = randomUUID()
      .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
      .replace(/-/g, "")
      .slice(0, 10);
    const species = await req(
      "POST",
      "/species",
      JSON.stringify({
        latinName: `Exportfoto${tag} test`,
        germanName: "Exportfoto",
        difficulty: 2,
        standardLevel: 3,
        lightDemandLux: 40000,
        growthMeasure: "rosette_diameter",
        etiolationSigns: "Rosette streckt sich.",
        successCriteria: "Dichte, flache Rosette.",
      }),
    );
    expect(species.status).toBe(201);
    const speciesId = ((await species.json()) as { id: string }).id;
    const specimen = await req(
      "POST",
      "/specimens",
      JSON.stringify({ speciesId, timeZone: "Europe/Berlin" }),
    );
    expect(specimen.status).toBe(201);
    const specimenId = ((await specimen.json()) as { id: string }).id;
    const measurement = await req(
      "POST",
      `/specimens/${specimenId}/measurements`,
      JSON.stringify({ timeZone: "Europe/Berlin", value: 10 }),
    );
    expect(measurement.status).toBe(201);
    const jpeg = await sharp({
      create: { width: 640, height: 480, channels: 3, background: "#2a7a3a" },
    })
      .jpeg()
      .toBuffer();
    const up = await req(
      "POST",
      `/specimens/${specimenId}/measurements/photo?timeZone=Europe/Berlin`,
      jpeg,
      "image/jpeg",
    );
    expect(up.status).toBe(201);

    const res = await req("GET", "/account/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-missing-photos")).toBe("0");
    const entries = zipEntries(Buffer.from(await res.arrayBuffer()));
    const photoEntries = [...entries.keys()].filter((name) => name.startsWith("photos/"));
    expect(photoEntries).toHaveLength(1);
    const [file] = photoEntries as [string];
    expect(file).toMatch(/^photos\/[0-9a-f-]{36}\.webp$/);
    const data = JSON.parse((entries.get("data.json") as Buffer).toString("utf8")) as {
      photos: { table: string; column: string; name: string; file: string | null }[];
    };
    expect(data.photos).toEqual([
      { table: "measurement", column: "photo", name: file.slice("photos/".length), file },
    ]);
    const bytes = entries.get(file) as Buffer;
    expect([
      bytes.subarray(0, 4).toString("latin1"),
      bytes.subarray(8, 12).toString("latin1"),
    ]).toEqual(["RIFF", "WEBP"]);
    expect((await sharp(bytes).metadata()).format).toBe("webp");
  });
});
