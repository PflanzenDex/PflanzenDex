import { describe, expect, it } from "vitest";
import { appError, failed } from "../../../../kernel";
import { measurementPhotoFile } from "../../../index";
import { InMemoryMeasurements, SpecimenStub } from "../../../shared/test-helpers";

const E1 = "00000000-0000-4000-8000-000000000001";
const E2 = "00000000-0000-4000-8000-000000000002";
const ANNA = "11111111-1111-4111-8111-111111111111";
const BEN = "22222222-2222-4222-8222-222222222222";
const BYTES = new Uint8Array([0xff, 0xd8, 1, 2]);

async function setup() {
  const measurements = new InMemoryMeasurements({ [ANNA]: [E1], [BEN]: [E2] });
  const stored = new Map<string, { bytes: Uint8Array; contentType: string }>();
  /** Every read the operation asks the image port for: the name and the size (NFR-12). */
  const reads: [string, string][] = [];
  const images = {
    read: async (accountId: string, name: string, size: "full" | "thumb") => {
      reads.push([name, size]);
      const found = stored.get(`${accountId}/${name}`);
      return found ? { ok: true as const, value: found } : failed(appError("media.not_found"));
    },
  };
  const m = (userId: string, specimenId: string) =>
    measurements.create(userId, {
      specimenId,
      date: "2026-10-01",
      value: 10,
      quality: "healthy",
      note: null,
      ratedBy: "keeper",
    });
  const withPhoto = await m(ANNA, E1);
  const without = await m(ANNA, E1);
  if (typeof withPhoto === "string" || typeof without === "string") throw new Error("fixture");
  await measurements.setPhoto(ANNA, withPhoto.id, "p1.jpg");
  stored.set(`${ANNA}/p1.jpg`, { bytes: BYTES, contentType: "image/jpeg" });
  const read = (userId: string, specimenId: string, id: string, ...sizes: string[]) =>
    measurementPhotoFile(
      { measurements, specimens: new SpecimenStub({ [ANNA]: [E1], [BEN]: [E2] }), images },
      userId,
      { specimenId, measurementId: id, sizes },
    );
  return { read, reads, withPhoto, without };
}

describe("US-WAC-05 the photo of a measurement is private to its owner (P-05)", () => {
  it("the owner gets the stored image", async () => {
    const { read, withPhoto } = await setup();
    const r = await read(ANNA, E1, withPhoto.id);
    expect(r.ok && r.value.contentType).toBe("image/jpeg");
    expect(r.ok && Array.from(r.value.bytes)).toEqual(Array.from(BYTES));
  });

  it("a measurement without a photo answers measurement.photo_not_found", async () => {
    const { read, without } = await setup();
    const r = await read(ANNA, E1, without.id);
    expect(!r.ok && r.error.code).toBe("measurement.photo_not_found");
  });

  it("another account sees nothing, it looks like a missing specimen (P-04)", async () => {
    const { read, withPhoto } = await setup();
    const r = await read(BEN, E1, withPhoto.id);
    expect(!r.ok && r.error.code).toBe("specimen.not_found");
  });

  it("an unknown measurement id is photo_not_found", async () => {
    const { read } = await setup();
    const r = await read(ANNA, E1, "00000000-0000-4000-8000-0000000000ff");
    expect(!r.ok && r.error.code).toBe("measurement.photo_not_found");
  });

  it("NFR-12 the thumbnail size asks the image port for the thumbnail, the default asks for the stored copy", async () => {
    const { read, reads, withPhoto } = await setup();
    await read(ANNA, E1, withPhoto.id, "thumb");
    await read(ANNA, E1, withPhoto.id);
    expect(reads).toEqual([
      ["p1.jpg", "thumb"],
      ["p1.jpg", "full"],
    ]);
  });

  it("NFR-12 a size other than thumb is input.invalid on the field size, and nothing is read", async () => {
    const { read, reads, withPhoto } = await setup();
    for (const sizes of [["huge"], ["full"], [""], ["THUMB"], ["thumb", "thumb"]]) {
      const r = await read(ANNA, E1, withPhoto.id, ...sizes);
      expect(!r.ok && r.error.code).toBe("input.invalid");
      expect(!r.ok && r.error.details).toEqual([{ field: "size", code: "input.invalid" }]);
    }
    expect(reads).toEqual([]);
  });

  it("NFR-12 another account asking for the thumbnail sees nothing either (P-04)", async () => {
    const { read, withPhoto, reads } = await setup();
    const r = await read(BEN, E1, withPhoto.id, "thumb");
    expect(!r.ok && r.error.code).toBe("specimen.not_found");
    expect(reads).toEqual([]);
  });
});
