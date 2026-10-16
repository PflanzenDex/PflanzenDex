import { crc32 } from "node:zlib";

// A ZIP archive without compression ("stored"), written by hand because the export needs nothing more: photos are JPEG
// already, `data.json` is small, and a fixed date and fixed order make the same files give the same bytes (US-ACC-04).
// Sizes stay below 4 GB (no ZIP64); the export of one keeper is far below that (assumption).

export interface ZipEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

// 1980-01-01 00:00:00 in DOS time and date.
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;
const UTF8_NAMES = 0x0800;

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}

export function zipArchive(entries: readonly ZipEntry[]): Buffer {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of sorted) {
    const name = Buffer.from(e.path, "utf8");
    const data = Buffer.from(e.bytes);
    const crc = crc32(data);
    const common = [
      u16(20), // version needed
      u16(UTF8_NAMES),
      u16(0), // method: stored
      u16(DOS_TIME),
      u16(DOS_DATE),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0), // extra field length
    ];
    const header = Buffer.concat([u32(0x04034b50), ...common, name]);
    local.push(header, data);
    central.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20), // version made by
        ...common,
        u16(0), // comment length
        u16(0), // disk number
        u16(0), // internal attributes
        u32(0), // external attributes
        u32(offset),
        name,
      ]),
    );
    offset += header.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(sorted.length),
    u16(sorted.length),
    u32(directory.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...local, directory, end]);
}
