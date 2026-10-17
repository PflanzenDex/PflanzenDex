import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import { measurementPhoto, measurementRecord } from "../../index";
import { SpecimenStub, InMemoryMeasurements, PhotoStorageStub } from "../../shared/test-helpers";

const E1 = "00000000-0000-4000-8000-000000000001";
const E2 = "00000000-0000-4000-8000-000000000002";
const ANNA = "11111111-1111-4111-8111-111111111111";
const BEN = "22222222-2222-4222-8222-222222222222";
// 2026-10-02 23:30 UTC: already 3 October in Berlin (NFR-08).
const NOW = new Date("2026-10-02T23:30:00Z");
const DIGEST = "a".repeat(64);
const original = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 1, 2, 3, 4]); // pretend: JPEG with GPS

let measurements: InMemoryMeasurements;
let storage: PhotoStorageStub;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const owners = { [ANNA]: [E1], [BEN]: [E2] };
const photo = (
  input: Record<string, unknown> = {},
  upload: { bytes: Uint8Array; contentType: string } = {
    bytes: original,
    contentType: "image/jpeg",
  },
  userId = ANNA,
  key = `k${++counter}`,
) =>
  execute(
    measurementPhoto({
      measurements,
      specimens: new SpecimenStub(owners),
      storage,
      newName: () => `photo-${counter}`,
      clock: () => NOW,
      upload,
    }),
    { idempotency: idem },
    {
      context: { userId },
      input: { specimenId: E1, timeZone: "Europe/Berlin", digest: DIGEST, ...input },
      idempotencyKey: key,
    },
  );
const measure = (date: string | null = null, userId = ANNA) =>
  execute(
    measurementRecord({
      measurements,
      specimens: new SpecimenStub(owners),
      clock: () => NOW,
    }),
    { idempotency: idem },
    {
      context: { userId },
      input: { specimenId: E1, timeZone: "Europe/Berlin", value: 12, date },
      idempotencyKey: `m${++counter}`,
    },
  );
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error?.code);

beforeEach(() => {
  measurements = new InMemoryMeasurements(owners);
  storage = new PhotoStorageStub();
  idem = new InMemoryIdempotencyStore();
});

describe("US-WAC-06 Foto ablegen: Verarbeitung und Zuordnung", () => {
  it("stores the processed photo with the measurement of the same day", async () => {
    await measure();
    const r = await photo();
    expect(r).toMatchObject({
      ok: true,
      value: { date: "2026-10-03", width: 800, height: 600, replaced: false },
    });
    const name = r.ok ? r.value.photo : "";
    expect(measurements.rows[0]?.photo).toBe(name);
    expect([...storage.objects]).toEqual([`${ANNA}/${name}`]);
    expect(storage.objects.size).toBe(1);
  });

  it("belongs to the measurement of the named day, not to another day", async () => {
    await measure("2026-10-01");
    await measure("2026-10-03");
    const r = await photo({ date: "2026-10-01" });
    expect(r.ok && r.value.date).toBe("2026-10-01");
    expect(measurements.rows.map((z) => z.photo !== null)).toEqual([true, false]);
  });

  it("with several measurements on the day the photo goes to the last one recorded", async () => {
    await measure();
    await measure();
    await photo();
    expect(measurements.rows.map((z) => z.photo !== null)).toEqual([false, true]);
  });

  it("without a measurement on that day it aborts with measurement.not_found and stores nothing", async () => {
    await measure("2026-10-01");
    const r = await photo();
    expect(code(r)).toBe("measurement.not_found");
    expect(storage.objects.size).toBe(0);
    expect(storage.calls).toBe(0);
  });

  it("a date in the future is rejected", async () => {
    await measure();
    expect(code(await photo({ date: "2026-10-04" }))).toBe("input.invalid");
    expect(storage.objects.size).toBe(0);
  });

  it("a foreign specimen looks unknown and nothing is stored (P-04)", async () => {
    await measure();
    const r = await photo({ specimenId: E2 });
    expect(code(r)).toBe("specimen.not_found");
    expect(storage.objects.size).toBe(0);
  });

  it("a foreign account cannot attach a photo to someone's measurement", async () => {
    await measure();
    expect(code(await photo({}, undefined, BEN))).toBe("specimen.not_found");
    expect(measurements.rows[0]?.photo).toBeNull();
  });

  it("an invalid digest is rejected before anything runs", async () => {
    await measure();
    expect(code(await photo({ digest: "nope" }))).toBe("input.invalid");
  });
});

describe("US-WAC-06 Foto ablegen: Ersetzen nur nach Bestätigung", () => {
  it("a second photo without confirmation keeps the first and stores nothing new", async () => {
    await measure();
    const first = await photo();
    const second = await photo();
    expect(code(second)).toBe("measurement.photo_exists");
    expect(measurements.rows[0]?.photo).toBe(first.ok ? first.value.photo : "");
    expect(storage.objects.size).toBe(1);
  });

  it("with confirmation the new photo replaces the old one and the old object is deleted", async () => {
    await measure();
    const first = await photo();
    const second = await photo({ replace: true });
    expect(second).toMatchObject({ ok: true, value: { replaced: true } });
    const [a, b] = [first, second].map((r) => (r.ok ? r.value.photo : ""));
    expect(a).not.toBe(b);
    expect(measurements.rows[0]?.photo).toBe(b);
    expect(storage.objects.size).toBe(1);
    expect(storage.objects.has(`${ANNA}/${a}`)).toBe(false);
  });

  it("a failed replacement keeps the old photo", async () => {
    await measure();
    const first = await photo();
    storage.refusal = "media.not_an_image";
    expect(code(await photo({ replace: true }))).toBe("media.not_an_image");
    expect(measurements.rows[0]?.photo).toBe(first.ok ? first.value.photo : "");
    expect(storage.objects.size).toBe(1);
  });
});

describe("US-WAC-06 Foto ablegen: ungültige und zu große Datei", () => {
  it("a file that is not an image aborts with media.not_an_image and writes nothing", async () => {
    await measure();
    storage.refusal = "media.not_an_image";
    expect(code(await photo())).toBe("media.not_an_image");
    expect(measurements.rows[0]?.photo).toBeNull();
    expect(storage.objects.size).toBe(0);
  });

  it.each([
    ["too large", "media.too_large"],
    ["of an unsupported type", "media.type_unsupported"],
  ] as const)("a file %s aborts with %s and writes nothing", async (_, refusal) => {
    await measure();
    storage.refusal = refusal;
    expect(code(await photo())).toBe(refusal);
    expect(measurements.rows[0]?.photo).toBeNull();
    expect(storage.objects.size).toBe(0);
  });
});

describe("US-WAC-06 / US-QS-03 Foto ablegen: Wiederholungsschutz", () => {
  it("the same key twice stores one photo and returns the same answer", async () => {
    await measure();
    const a = await photo({}, undefined, ANNA, "same");
    const b = await photo({}, undefined, ANNA, "same");
    expect(b).toEqual(a);
    expect(storage.objects.size).toBe(1);
  });

  it("the same key with another file is a conflict", async () => {
    await measure();
    await photo({}, undefined, ANNA, "same");
    expect(code(await photo({ digest: "b".repeat(64) }, undefined, ANNA, "same"))).toBe(
      "idempotency.key_conflict",
    );
  });
});
