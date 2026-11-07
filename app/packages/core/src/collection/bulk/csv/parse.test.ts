import { describe, expect, it } from "vitest";
import { parseImportCsv } from "./parse";

const rowsOf = (text: string) => {
  const r = parseImportCsv(text);
  if (!r.ok) throw new Error(`refused: ${r.error.code}`);
  return r.value;
};
const refusedWith = (text: string) => {
  const r = parseImportCsv(text);
  return r.ok ? null : r.error.code;
};

describe("US-BES-18 CSV import: reading the file (FR-BES-26)", () => {
  it("US-BES-18 reads comma separated German columns by their names", () => {
    const rows = rowsOf(
      "Art,Spitzname,Standort,Kaufdatum,Notizen\nMonstera deliciosa,Lulu,Fensterbank,2026-03-01,gekauft im Baumarkt",
    );
    expect(rows).toEqual([
      {
        line: 2,
        species: "Monstera deliciosa",
        nickname: "Lulu",
        location: "Fensterbank",
        purchaseDate: { kind: "iso", value: "2026-03-01" },
        notes: "gekauft im Baumarkt",
      },
    ]);
  });

  it("US-BES-18 detects a semicolon separator from the header line (spreadsheets in German)", () => {
    const rows = rowsOf("Art;Standort\nAloe vera;Küche\nHaworthia;Bad");
    expect(rows.map((r) => [r.species, r.location])).toEqual([
      ["Aloe vera", "Küche"],
      ["Haworthia", "Bad"],
    ]);
  });

  it("US-BES-18 strips a byte order mark and reads the English column names", () => {
    const rows = rowsOf(
      "﻿species name,nickname,location,purchase date,notes\nFicus lyrata,Berta,Wohnzimmer,01.03.2026,\n",
    );
    expect(rows[0]).toMatchObject({
      species: "Ficus lyrata",
      nickname: "Berta",
      location: "Wohnzimmer",
      purchaseDate: { kind: "iso", value: "2026-03-01" },
      notes: null,
    });
  });

  it("US-BES-18 ignores unknown columns, keeps the order of the others and reads a missing cell as none", () => {
    const rows = rowsOf("Preis,Art,Notizen\n12,Calathea,\n");
    expect(rows).toEqual([
      {
        line: 2,
        species: "Calathea",
        nickname: null,
        location: null,
        purchaseDate: { kind: "absent" },
        notes: null,
      },
    ]);
  });

  it("US-BES-18 keeps separators and line breaks inside quotes; a doubled quote is one quote", () => {
    const rows = rowsOf(
      'Art,Notizen\n"Aloe vera","Zeile 1\nZeile 2; mit ""Zitat"", ok"\nHoya,kurz',
    );
    expect(rows[0]?.notes).toBe('Zeile 1\nZeile 2; mit "Zitat", ok');
    // The record after the two-line note starts on physical line 4.
    expect(rows.map((r) => r.line)).toEqual([2, 4]);
  });

  it("US-BES-18 dates: YYYY-MM-DD and DD.MM.YYYY become YYYY-MM-DD; an impossible date is kept as invalid", () => {
    const rows = rowsOf(
      "Art,Kaufdatum\nA,01.02.2026\nB,2026-02-28\nC,31.02.2026\nD,\nE,29.02.2024\nF,2025-02-29\nG,2.3.2026",
    );
    expect(rows.map((r) => r.purchaseDate)).toEqual([
      { kind: "iso", value: "2026-02-01" },
      { kind: "iso", value: "2026-02-28" },
      { kind: "invalid", raw: "31.02.2026" },
      { kind: "absent" },
      { kind: "iso", value: "2024-02-29" },
      { kind: "invalid", raw: "2025-02-29" },
      { kind: "invalid", raw: "2.3.2026" },
    ]);
  });

  it("US-BES-18 a file of 500 rows is read; 501 rows are refused as too large (FR-BES-26)", () => {
    const body = (n: number) => Array.from({ length: n }, (_, i) => `Pflanze ${i}`).join("\n");
    expect(rowsOf(`Art\n${body(500)}`)).toHaveLength(500);
    expect(refusedWith(`Art\n${body(501)}`)).toBe("import.too_large");
  });

  it("US-BES-18 a file of 1 MB is read; one byte more is refused as too large, counted in UTF-8 bytes", () => {
    const limit = 1024 * 1024;
    expect(rowsOf(`Art\n${"a".repeat(limit - 4)}`)).toHaveLength(1);
    expect(refusedWith(`Art\n${"a".repeat(limit - 3)}`)).toBe("import.too_large");
    // 600 000 umlauts are 600 000 characters but 1.2 MB of UTF-8.
    expect(refusedWith(`Art\n${"ä".repeat(600_000)}`)).toBe("import.too_large");
  });

  it("US-BES-18 a file without a species column is refused as a whole", () => {
    expect(refusedWith("Spitzname,Standort\nLulu,Küche")).toBe("import.no_species_column");
    expect(refusedWith("Name,Notizen\nAloe,x")).toBe("import.no_species_column");
  });

  it("US-BES-18 a known column that appears twice is refused, no value is taken from either", () => {
    expect(refusedWith("Art,Art\nAloe,Haworthia")).toBe("import.column_repeated");
  });

  it.each([
    ["an empty file", ""],
    ["only whitespace", "  \n \n"],
    ["a NUL byte", "Art\nAl\u0000oe"],
    ["a replacement character from a broken encoding", "Art\nAlo�e"],
    ["an unterminated quoted field", 'Art,Notizen\nAloe,"offen'],
    ["a row with more cells than the header", "Art\nAloe,zu viel"],
  ])("US-BES-18 an unreadable file is refused as a whole: %s", (_name, text) => {
    expect(refusedWith(text)).toBe("import.file_unreadable");
  });

  it("US-BES-18 blank lines and rows without any value are skipped; a header alone has no rows", () => {
    expect(rowsOf("Art,Notizen\n\nAloe,\n,\n\nHoya,\n")).toHaveLength(2);
    expect(rowsOf("Art,Notizen\n")).toEqual([]);
  });
});
