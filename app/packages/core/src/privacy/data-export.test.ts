import { describe, expect, it } from "vitest";
import { InMemoryObjectStore } from "../media";
import { canonicalJson, exportAccountData, type AccountDataSnapshot } from "./data-export";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const PHOTO = "aaaaaaaa-0000-4000-8000-000000000001.jpg";
const GONE = "aaaaaaaa-0000-4000-8000-000000000002.jpg";

const snapshot: AccountDataSnapshot = {
  tables: {
    specimen: [{ name: "Ficus", id: "s1" }],
    measurement: [
      { id: "m1", photo: PHOTO },
      { id: "m2", photo: GONE },
    ],
    wish: [],
  },
  photos: [
    { table: "measurement", column: "photo", name: GONE },
    { table: "measurement", column: "photo", name: PHOTO },
  ],
};

async function fixture(read: AccountDataSnapshot | null = snapshot) {
  const photos = new InMemoryObjectStore();
  await photos.put(ACCOUNT, PHOTO, new Uint8Array([1, 2, 3]), "image/jpeg");
  return { photos, source: { read: async () => read } };
}

describe("US-ACC-04 export of all own data (core)", () => {
  it("US-ACC-04 puts every table row into data.json and every photo into a file", async () => {
    const r = await exportAccountData(await fixture(), ACCOUNT);
    if (!r.ok) throw new Error("expected ok");
    expect(r.value.files.map((f) => f.path)).toEqual([`photos/${PHOTO}`]);
    const document = JSON.parse(r.value.dataJson);
    expect(document.format).toBe("pflanzendex-export");
    expect(document.tables.specimen).toEqual([{ name: "Ficus", id: "s1" }]);
    expect(Array.from(r.value.files[0]?.bytes ?? [])).toEqual([1, 2, 3]);
  });

  it("US-ACC-04 names a photo the store no longer holds instead of dropping it silently (P-10)", async () => {
    const r = await exportAccountData(await fixture(), ACCOUNT);
    if (!r.ok) throw new Error("expected ok");
    expect(r.value.missingPhotos).toBe(1);
    const document = JSON.parse(r.value.dataJson);
    expect(document.photos).toEqual([
      expect.objectContaining({ name: PHOTO, file: `photos/${PHOTO}` }),
      expect.objectContaining({ name: GONE, file: null }),
    ]);
  });

  it("US-ACC-04 is reproducible: same data, same bytes, whatever the order of keys", async () => {
    const a = await exportAccountData(await fixture(), ACCOUNT);
    const reordered: AccountDataSnapshot = {
      ...snapshot,
      tables: {
        wish: [],
        measurement: snapshot.tables["measurement"] ?? [],
        specimen: [{ id: "s1", name: "Ficus" }],
      },
    };
    const b = await exportAccountData(await fixture(reordered), ACCOUNT);
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(b.value.dataJson).toBe(a.value.dataJson);
  });

  it("US-ACC-04 refuses an unknown account", async () => {
    const r = await exportAccountData(await fixture(null), ACCOUNT);
    expect(r).toMatchObject({ ok: false, error: { code: "access.denied" } });
  });

  it("US-ACC-04 canonical JSON sorts keys at every level", () => {
    expect(canonicalJson({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }] } })).toBe(
      '{\n  "a": {\n    "c": [\n      {\n        "y": 2,\n        "z": 1\n      }\n    ],\n    "d": 1\n  },\n  "b": 1\n}\n',
    );
  });
});
