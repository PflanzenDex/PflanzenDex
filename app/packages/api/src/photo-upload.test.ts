import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appError,
  failed,
  InMemoryObjectStore,
  MEDIA_LIMITS,
  thumbnailName,
  type Result,
} from "@pflanzendex/core";
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
  it("NFR-12 US-WAC-06 stores a rotated, shrunk WebP without EXIF/GPS for the measurement of the same day", async () => {
    const e = await newSpecimen(subA, "Verarbeitung");
    await measure(subA, e);
    // 3200x2000 with orientation 6: shown upright as 2000x3200, so the long side shrinks to 1600 (1000x1600).
    const r = await upload(subA, e, await gpsPhoto(3200, 2000, 6));
    expect(r).toMatchObject({ status: 201, body: { date: "2026-10-03", replaced: false } });
    const account = (await admin.query("select account_id from specimen where id = $1", [e]))
      .rows[0].account_id;
    const stored = await store.get(account, r.body["photo"]);
    if (!stored.ok) throw new Error("not stored");
    expect(stored.value.contentType).toBe("image/webp");
    const meta = await sharp(stored.value.bytes).metadata();
    expect([meta.format, meta.width, meta.height, meta.exif, meta.orientation]).toEqual([
      "webp",
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

describe("US-QS-03 a repeated upload after a lost answer is not a second photo", () => {
  it("US-QS-03 the same key and the same file replay the stored answer: 201, the same photo, no photo_exists", async () => {
    const e = await newSpecimen(subA, "Wiederholt");
    await measure(subA, e);
    const bytes = await gpsPhoto(400, 300);
    const key = randomUUID();
    // The keeper never saw the first answer, so the same upload goes out again with the same key.
    const first = await upload(subA, e, bytes, "", "image/jpeg", key);
    const repeat = await upload(subA, e, bytes, "", "image/jpeg", key);
    expect(first).toMatchObject({ status: 201, body: { replaced: false } });
    expect(repeat).toMatchObject({
      status: 201,
      body: { photo: first.body["photo"], replaced: false },
    });
    expect((await call(subA, "GET", `/specimens/${e}/measurements`)).body["last"].photo).toBe(
      first.body["photo"],
    );
  });

  it("US-QS-03 the same key with another file is a key conflict, never a second photo", async () => {
    const e = await newSpecimen(subA, "Anderes");
    await measure(subA, e);
    const key = randomUUID();
    const first = await upload(subA, e, await gpsPhoto(400, 300), "", "image/jpeg", key);
    const other = await upload(subA, e, await gpsPhoto(300, 400), "", "image/jpeg", key);
    expect(other).toMatchObject({
      status: 409,
      body: { error: { code: "idempotency.key_conflict" } },
    });
    expect((await call(subA, "GET", `/specimens/${e}/measurements`)).body["last"].photo).toBe(
      first.body["photo"],
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

  it("NFR-12 US-WAC-05 the owner gets the stored WebP; foreign accounts and anonymous callers get nothing", async () => {
    const e = await newSpecimen(subA, "Lesen");
    await measure(subA, e);
    const up = await upload(subA, e, await gpsPhoto(400, 300));
    const mid = up.body["measurementId"] as string;
    const own = await raw(subA, e, mid);
    expect([own.status, own.headers.get("content-type")]).toEqual([200, "image/webp"]);
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

/** A store that refuses to write thumbnails, like an unavailable bucket for one write (NFR-12, P-10). */
class FailingThumbnailStore extends InMemoryObjectStore {
  override async put(
    accountId: string,
    name: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<Result<void>> {
    if (name.endsWith("-thumb.webp")) return failed(appError("media.storage_unavailable"));
    return super.put(accountId, name, bytes, contentType);
  }
}

describe("NFR-12 thumbnails for tiles and cards", () => {
  const read = (sub: string | null, e: string, m: string, query = "") =>
    app.request(`/specimens/${e}/measurements/${m}/photo${query}`, {
      headers: sub ? { authorization: `Bearer valid:${sub}` } : {},
    });
  const accountOf = async (e: string) =>
    (await admin.query("select account_id from specimen where id = $1", [e])).rows[0]
      .account_id as string;
  const longEdge = async (bytes: Uint8Array) => {
    const meta = await sharp(bytes).metadata();
    return Math.max(meta.width ?? 0, meta.height ?? 0);
  };

  it("NFR-12 an upload stores a 256 px WebP thumbnail next to the photo, without metadata", async () => {
    const e = await newSpecimen(subA, "Vorschau");
    await measure(subA, e);
    const r = await upload(subA, e, await gpsPhoto(3200, 2000, 6));
    const account = await accountOf(e);
    const small = await store.get(account, thumbnailName(r.body["photo"] as string));
    if (!small.ok) throw new Error("no thumbnail stored");
    expect(small.value.contentType).toBe("image/webp");
    const meta = await sharp(small.value.bytes).metadata();
    expect([meta.format, Math.max(meta.width ?? 0, meta.height ?? 0), meta.exif]).toEqual([
      "webp",
      256,
      undefined,
    ]);
    expect(Buffer.from(small.value.bytes).includes(Buffer.from("TestCam"))).toBe(false);
  });

  it("NFR-12 size=thumb answers the thumbnail, the plain request the stored copy", async () => {
    const e = await newSpecimen(subA, "Groesse");
    await measure(subA, e);
    const mid = (await upload(subA, e, await gpsPhoto(3200, 2000, 6))).body["measurementId"];
    const small = await read(subA, e, mid as string, "?size=thumb");
    const full = await read(subA, e, mid as string);
    expect([small.status, small.headers.get("content-type")]).toEqual([200, "image/webp"]);
    expect(small.headers.get("cache-control")).toContain("private");
    const smallBytes = new Uint8Array(await small.arrayBuffer());
    const fullBytes = new Uint8Array(await full.arrayBuffer());
    expect([await longEdge(smallBytes), await longEdge(fullBytes)]).toEqual([256, 1600]);
    expect(smallBytes.byteLength).toBeLessThan(fullBytes.byteLength);
  });

  it("NFR-12 size is validated: only thumb is allowed, anything else is input.invalid (400)", async () => {
    const e = await newSpecimen(subA, "Pruefung");
    await measure(subA, e);
    const mid = (await upload(subA, e, await gpsPhoto(400, 300))).body["measurementId"] as string;
    for (const query of ["?size=huge", "?size=full", "?size=", "?size=thumb&size=thumb"]) {
      const r = await read(subA, e, mid, query);
      expect(r.status).toBe(400);
      expect(((await r.json()) as { error: { code: string } }).error.code).toBe("input.invalid");
    }
  });

  it("NFR-12 a photo stored before the thumbnail existed answers the stored copy for size=thumb, never 404", async () => {
    const e = await newSpecimen(subA, "Altbestand");
    await measure(subA, e);
    const up = await upload(subA, e, await gpsPhoto(400, 300));
    const account = await accountOf(e);
    await store.delete(account, thumbnailName(up.body["photo"] as string));
    const mid = up.body["measurementId"] as string;
    const r = await read(subA, e, mid, "?size=thumb");
    const full = await read(subA, e, mid);
    expect(r.status).toBe(200);
    expect(Array.from(new Uint8Array(await r.arrayBuffer()))).toEqual(
      Array.from(new Uint8Array(await full.arrayBuffer())),
    );
  });

  it("NFR-12 another account never reads the thumbnail of a photo (P-04)", async () => {
    const e = await newSpecimen(subA, "Fremdvorschau");
    await measure(subA, e);
    const mid = (await upload(subA, e, await gpsPhoto(400, 300))).body["measurementId"] as string;
    await call(subB, "GET", "/account"); // creates the account of B
    const r = await read(subB, e, mid, "?size=thumb");
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("specimen.not_found");
    expect((await read(null, e, mid, "?size=thumb")).status).toBe(401);
  });

  it("NFR-12 replacing the photo removes the thumbnail of the old one with it", async () => {
    const e = await newSpecimen(subA, "Ersatz");
    await measure(subA, e);
    const first = await upload(subA, e, await gpsPhoto(400, 300));
    const second = await upload(subA, e, await gpsPhoto(300, 400), "&replace=true");
    const account = await accountOf(e);
    expect(await store.exists(account, thumbnailName(first.body["photo"] as string))).toEqual({
      ok: true,
      value: false,
    });
    expect(await store.exists(account, thumbnailName(second.body["photo"] as string))).toEqual({
      ok: true,
      value: true,
    });
  });

  it("NFR-12 a failed thumbnail write refuses the upload with 502 and keeps the measurement without photo (P-10)", async () => {
    const e = await newSpecimen(subA, "Vorschaufehler");
    await measure(subA, e);
    const failing = createApp({
      reviewer,
      pool,
      clock: () => NOW,
      media: { store: new FailingThumbnailStore(), processor: createSharpProcessor() },
    });
    const res = await failing.request(`/specimens/${e}/measurements/photo?timeZone=Europe/Berlin`, {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        authorization: `Bearer valid:${subA}`,
        "idempotency-key": randomUUID(),
      },
      body: (await gpsPhoto(400, 300)) as unknown as NonNullable<RequestInit["body"]>,
    });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "media.storage_unavailable",
    );
    expect((await call(subA, "GET", `/specimens/${e}/measurements`)).body["last"].photo).toBeNull();
  });
});

describe("NFR-12 US-WAC-06 a replaced photo has a new address", () => {
  const versionOf = (photo: unknown) => String(photo).replace(/\.webp$/, "");
  const readPhoto = (sub: string, e: string, m: string, query: string) =>
    app.request(`/specimens/${e}/measurements/${m}/photo${query}`, {
      headers: { authorization: `Bearer valid:${sub}` },
    });
  // The file declares its own `Response` (the JSON of `call`), so the fetch type is named here.
  const bytesOf = async (res: globalThis.Response) =>
    Array.from(new Uint8Array(await res.arrayBuffer()));
  const cardPhoto = async (sub: string, id: string) =>
    (
      (await call(sub, "GET", "/specimens/cards?timeZone=Europe/Berlin")).body["cards"] as {
        id: string;
        photo: { url: string } | null;
      }[]
    ).find((k) => k.id === id)?.photo?.url;

  it("NFR-12 US-WAC-06 the photo route answers 200 with ?v= and with ?size=thumb&v=, and reads the current photo", async () => {
    const e = await newSpecimen(subA, "Version");
    await measure(subA, e);
    const up = await upload(subA, e, await gpsPhoto(3200, 2000, 6));
    const mid = up.body["measurementId"] as string;
    const v = versionOf(up.body["photo"]);
    const full = await readPhoto(subA, e, mid, `?v=${v}`);
    const small = await readPhoto(subA, e, mid, `?size=thumb&v=${v}`);
    expect([full.status, full.headers.get("content-type")]).toEqual([200, "image/webp"]);
    expect([small.status, small.headers.get("content-type")]).toEqual([200, "image/webp"]);
    expect(full.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(small.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(await bytesOf(full)).toEqual(await bytesOf(await readPhoto(subA, e, mid, "")));
    expect(await bytesOf(small)).toEqual(
      await bytesOf(await readPhoto(subA, e, mid, "?size=thumb")),
    );
    // The version is not read: an unknown one still answers the current photo.
    const other = await readPhoto(subA, e, mid, "?v=unbekannt");
    expect(other.status).toBe(200);
  });

  it("NFR-12 US-WAC-06 after a replacement the card and the measurement list carry the new version", async () => {
    const e = await newSpecimen(subA, "Ersatzadresse");
    await measure(subA, e);
    const first = await upload(subA, e, await gpsPhoto(400, 300));
    const before = await cardPhoto(subA, e);
    const second = await upload(subA, e, await gpsPhoto(300, 400), "&replace=true");
    const after = await cardPhoto(subA, e);
    const mid = first.body["measurementId"] as string;
    expect(before).toBe(
      `/specimens/${e}/measurements/${mid}/photo?v=${versionOf(first.body["photo"])}`,
    );
    expect(after).toBe(
      `/specimens/${e}/measurements/${mid}/photo?v=${versionOf(second.body["photo"])}`,
    );
    expect(after).not.toBe(before);
    const list = (await call(subA, "GET", `/specimens/${e}/measurements`)).body["measurements"] as {
      id: string;
      photo: string | null;
    }[];
    expect(list.find((m) => m.id === mid)?.photo).toBe(second.body["photo"]);
  });
});
