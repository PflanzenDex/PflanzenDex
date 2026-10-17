import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryObjectStore, MEDIA_LIMITS } from "@pflanzendex/core";
import { migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "./app";
import { createSharpProcessor } from "./media";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-WAC-06 / FR-WAC-09: upload the photo of a measurement through the API (real PostgreSQL, real image processing, in-memory object store).
let pool: Pool;
let admin: Pool;
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `wac6-${randomUUID()}`;
const subB = `wac6-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
// 2026-10-02 23:30 UTC: already October 3rd in Berlin (NFR-08).
const NOW = new Date("2026-10-02T23:30:00Z");
const store = new InMemoryObjectStore();
let app: ReturnType<typeof createApp>;
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(
  sub: string | null,
  method: string,
  path: string,
  init: { body?: RequestInit["body"]; type?: string; key?: string | null } = {},
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": init.type ?? "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  const key = init.key === undefined ? randomUUID() : init.key;
  if (key) headers["idempotency-key"] = key;
  const res = await app.request(path, {
    method,
    headers,
    ...(init.body === undefined ? {} : { body: init.body }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const json = (v: unknown) => JSON.stringify(v);

const newSpecimen = async (sub: string, name: string): Promise<string> => {
  const species = await call(sub, "POST", "/species", {
    body: json({
      latinName: `${name}${run} test`,
      germanName: `${name} ${run}`,
      difficulty: 2,
      standardLevel: 3,
      lightDemandLux: 40000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
    }),
  });
  const e = await call(sub, "POST", "/specimens", {
    body: json({ speciesId: species.body["id"], timeZone: "Europe/Berlin" }),
  });
  return e.body["id"] as string;
};
const measure = (sub: string, id: string, date?: string) =>
  call(sub, "POST", `/specimens/${id}/measurements`, {
    body: json({ timeZone: "Europe/Berlin", value: 10, ...(date ? { date } : {}) }),
  });
const upload = (
  sub: string | null,
  id: string,
  bytes: Uint8Array,
  query = "",
  type = "image/jpeg",
  key?: string | null,
) =>
  call(sub, "POST", `/specimens/${id}/measurements/photo?timeZone=Europe/Berlin${query}`, {
    body: bytes as unknown as RequestInit["body"],
    type,
    ...(key === undefined ? {} : { key }),
  });

const gpsPhoto = (width: number, height: number, orientation = 1) =>
  sharp({ create: { width, height, channels: 3, background: "#2a7a3a" } })
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
    .withMetadata({ orientation })
    .toBuffer();

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({
    reviewer,
    pool,
    clock: () => NOW,
    media: { store, processor: createSharpProcessor() },
  });
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

describe("US-WAC-06 sign-in", () => {
  it("POST photo without token: 401", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect((await upload(null, id, new Uint8Array([1]))).status).toBe(401);
  });
});

describe("US-WAC-06 / FR-WAC-09 processing and storage", () => {
  it("stores a rotated, shrunk JPEG without EXIF/GPS for the measurement of the same day", async () => {
    const e = await newSpecimen(subA, "Verarbeitung");
    await measure(subA, e);
    // 3200x2000 with orientation 6: shown upright as 2000x3200, so the long side shrinks to 1600 (1000x1600).
    const r = await upload(subA, e, await gpsPhoto(3200, 2000, 6));
    expect(r).toMatchObject({ status: 201, body: { date: "2026-10-03", replaced: false } });
    const account = (await admin.query("select account_id from specimen where id = $1", [e]))
      .rows[0].account_id;
    const stored = await store.get(account, r.body["photo"]);
    if (!stored.ok) throw new Error("not stored");
    const meta = await sharp(stored.value.bytes).metadata();
    expect([meta.format, meta.width, meta.height, meta.exif, meta.orientation]).toEqual([
      "jpeg",
      1000,
      1600,
      undefined,
      undefined,
    ]);
    expect(Buffer.from(stored.value.bytes).includes(Buffer.from("TestCam"))).toBe(false);
    const view = await call(subA, "GET", `/specimens/${e}/measurements`);
    expect(view.body["last"].photo).toBe(r.body["photo"]);
  });

  it("the same Idempotency-Key does not store a second photo (US-QS-03)", async () => {
    const e = await newSpecimen(subA, "Wiederholung");
    await measure(subA, e);
    const bytes = await gpsPhoto(400, 300);
    const key = randomUUID();
    const a = await upload(subA, e, bytes, "", "image/jpeg", key);
    const b = await upload(subA, e, bytes, "", "image/jpeg", key);
    expect([a.status, b.status, b.body["photo"]]).toEqual([201, 201, a.body["photo"]]);
  });
});

describe("US-WAC-06 replacing needs confirmation", () => {
  it("a second photo is refused (409) until replace=true; then the old object is gone", async () => {
    const e = await newSpecimen(subA, "Ersetzen");
    await measure(subA, e);
    const first = await upload(subA, e, await gpsPhoto(400, 300));
    const refused = await upload(subA, e, await gpsPhoto(300, 400));
    expect(refused).toMatchObject({
      status: 409,
      body: { error: { code: "measurement.photo_exists" } },
    });
    expect((await call(subA, "GET", `/specimens/${e}/measurements`)).body["last"].photo).toBe(
      first.body["photo"],
    );
    const second = await upload(subA, e, await gpsPhoto(300, 400), "&replace=true");
    expect(second).toMatchObject({ status: 201, body: { replaced: true } });
    const account = (await admin.query("select account_id from specimen where id = $1", [e]))
      .rows[0].account_id;
    expect(
      (await store.exists(account, first.body["photo"])).ok &&
        (await store.exists(account, first.body["photo"])),
    ).toMatchObject({ value: false });
    expect((await call(subA, "GET", `/specimens/${e}/measurements`)).body["last"].photo).toBe(
      second.body["photo"],
    );
  });
});

describe("US-WAC-06 aborts with a clear message", () => {
  it("no measurement on that day: 404 measurement.not_found, nothing stored", async () => {
    const e = await newSpecimen(subA, "OhneMessung");
    await measure(subA, e, "2026-10-01");
    const r = await upload(subA, e, await gpsPhoto(400, 300));
    expect(r).toMatchObject({ status: 404, body: { error: { code: "measurement.not_found" } } });
    expect(r.body["error"].text).toContain("Messung");
  });

  it("a file that is not an image: 422 media.not_an_image", async () => {
    const e = await newSpecimen(subA, "KeinBild");
    await measure(subA, e);
    const r = await upload(subA, e, new TextEncoder().encode("das ist kein Bild"));
    expect(r).toMatchObject({ status: 422, body: { error: { code: "media.not_an_image" } } });
    expect((await call(subA, "GET", `/specimens/${e}/measurements`)).body["last"].photo).toBeNull();
  });

  it("an unsupported type: 415 media.type_unsupported", async () => {
    const e = await newSpecimen(subA, "Typ");
    await measure(subA, e);
    const r = await upload(subA, e, await gpsPhoto(40, 30), "", "application/pdf");
    expect(r).toMatchObject({ status: 415, body: { error: { code: "media.type_unsupported" } } });
  });

  it("a too large file: 413 media.too_large", async () => {
    const e = await newSpecimen(subA, "Gross");
    await measure(subA, e);
    const r = await upload(subA, e, new Uint8Array(MEDIA_LIMITS.uploadMaxBytes + 1));
    expect(r).toMatchObject({ status: 413, body: { error: { code: "media.too_large" } } });
  });

  it("without time zone: 400 input.invalid", async () => {
    const e = await newSpecimen(subA, "OhneZone");
    const r = await call(subA, "POST", `/specimens/${e}/measurements/photo`, {
      body: (await gpsPhoto(40, 30)) as unknown as RequestInit["body"],
      type: "image/jpeg",
    });
    expect(r).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
  });
});

describe("US-WAC-06 tenant isolation (P-04)", () => {
  it("another account cannot attach a photo to a foreign measurement: 404, nothing changes", async () => {
    const e = await newSpecimen(subA, "Fremd");
    await measure(subA, e);
    await call(subB, "GET", "/account"); // creates the account of B
    const r = await upload(subB, e, await gpsPhoto(400, 300));
    expect(r).toMatchObject({ status: 404, body: { error: { code: "specimen.not_found" } } });
    expect((await call(subA, "GET", `/specimens/${e}/measurements`)).body["last"].photo).toBeNull();
  });
});

describe("US-WAC-05 reading the photo back is private to the owner (P-05)", () => {
  const raw = (sub: string | null, e: string, m: string) =>
    app.request(`/specimens/${e}/measurements/${m}/photo`, {
      headers: sub ? { authorization: `Bearer valid:${sub}` } : {},
    });

  it("the owner gets the stored JPEG; foreign accounts and anonymous callers get nothing", async () => {
    const e = await newSpecimen(subA, "Lesen");
    await measure(subA, e);
    const up = await upload(subA, e, await gpsPhoto(400, 300));
    const mid = up.body["measurementId"] as string;
    const own = await raw(subA, e, mid);
    expect([own.status, own.headers.get("content-type")]).toEqual([200, "image/jpeg"]);
    expect(own.headers.get("cache-control")).toContain("private");
    expect((await own.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect((await raw(subB, e, mid)).status).toBe(404);
    expect((await raw(null, e, mid)).status).toBe(401);
  });

  it("a measurement without a photo answers 404 measurement.photo_not_found", async () => {
    const e = await newSpecimen(subA, "OhneFoto");
    const m = await measure(subA, e);
    const r = await raw(subA, e, m.body["id"] as string);
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe(
      "measurement.photo_not_found",
    );
  });
});
