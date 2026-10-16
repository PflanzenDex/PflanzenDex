import { describe, expect, it } from "vitest";
import { zipArchive } from "./zip";

const text = (s: string) => new TextEncoder().encode(s);

describe("US-ACC-04 export archive", () => {
  it("US-ACC-04 writes a ZIP whose entries can be read back from the central directory", () => {
    const zip = zipArchive([
      { path: "photos/b.jpg", bytes: new Uint8Array([9, 8, 7]) },
      { path: "data.json", bytes: text('{"a":1}') },
    ]);
    const end = zip.length - 22;
    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    expect(zip.readUInt16LE(end + 10)).toBe(2);
    let at = zip.readUInt32LE(end + 16);
    const names: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      expect(zip.readUInt32LE(at)).toBe(0x02014b50);
      const size = zip.readUInt32LE(at + 24);
      const nameLength = zip.readUInt16LE(at + 28);
      const local = zip.readUInt32LE(at + 42);
      names.push(zip.subarray(at + 46, at + 46 + nameLength).toString());
      const dataAt = local + 30 + zip.readUInt16LE(local + 26);
      expect(zip.subarray(dataAt, dataAt + size).length).toBe(size);
      at += 46 + nameLength;
    }
    expect(names).toEqual(["data.json", "photos/b.jpg"]);
  });

  it("US-ACC-04 gives the same bytes for the same files, whatever the order they come in", () => {
    const a = { path: "a.txt", bytes: text("a") };
    const b = { path: "b.txt", bytes: text("b") };
    expect(zipArchive([a, b]).equals(zipArchive([b, a]))).toBe(true);
  });
});
