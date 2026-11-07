// Reads the import file (US-BES-18, FR-BES-26). A whole-file problem is a refusal: nothing of the file is taken over
// (P-10). Otherwise every data row becomes one ParsedRow; a blank row (all cells empty) holds no plant and is skipped.
import { appError, failed, ok, type AppError, type Result } from "../../../kernel";
import { IMPORT_LIMITS, type ParsedRow } from "../types";
import { columnsOf, parseDate, type Column, type ColumnIndex } from "./columns";
import { detectSeparator, splitRecords, type RawRecord } from "./records";

// Code points, UTF-8 sizes and the characters a text file may hold (named once, FR-QG-12).
const UTF8_LIMIT = { oneByte: 0x80, twoBytes: 0x800, threeBytes: 0x10000 } as const;
const UTF8_BYTES = { one: 1, two: 2, three: 3, four: 4 } as const;
const CHARACTER = {
  tab: 9,
  lineFeed: 10,
  carriageReturn: 13,
  space: 32,
  replacement: 0xfffd,
} as const;
const BYTE_ORDER_MARK = "﻿";
const NO_CODE_POINT = 0;

/** The size in UTF-8 bytes of a text (the limit of FR-BES-26 counts bytes, not characters). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? NO_CODE_POINT;
    bytes +=
      code < UTF8_LIMIT.oneByte
        ? UTF8_BYTES.one
        : code < UTF8_LIMIT.twoBytes
          ? UTF8_BYTES.two
          : code < UTF8_LIMIT.threeBytes
            ? UTF8_BYTES.three
            : UTF8_BYTES.four;
  }
  return bytes;
}

/** A character a text file does not hold: a control character except tab, line feed and carriage return, or the replacement character of a broken encoding. */
const isNotText = (code: number): boolean =>
  code === CHARACTER.replacement ||
  (code < CHARACTER.space &&
    code !== CHARACTER.tab &&
    code !== CHARACTER.lineFeed &&
    code !== CHARACTER.carriageReturn);

const isBinary = (text: string): boolean => {
  for (let i = 0; i < text.length; i++) if (isNotText(text.charCodeAt(i))) return true;
  return false;
};

const unreadable = (): AppError => appError("import.file_unreadable");

/** The text of the file, or the refusal: the size first, then the text itself (UTF-8, with or without a byte order mark). */
function textOf(raw: string): Result<string> {
  if (utf8Length(raw) > IMPORT_LIMITS.bytes) return failed(appError("import.too_large"));
  const text = raw.startsWith(BYTE_ORDER_MARK) ? raw.slice(BYTE_ORDER_MARK.length) : raw;
  return text.trim() === "" || isBinary(text) ? failed(unreadable()) : ok(text);
}

const blankToNull = (text: string): string | null => (text === "" ? null : text);

/** A data row, `blank` for a row without any value, or `ragged` for a row with more cells than the header has. */
function rowOf(
  record: RawRecord,
  columns: ColumnIndex,
  width: number,
): ParsedRow | "blank" | "ragged" {
  if (record.cells.slice(width).some((cell) => cell.trim() !== "")) return "ragged";
  const at = (field: Column): string => {
    const position = columns[field];
    return position === undefined ? "" : (record.cells[position] ?? "").trim();
  };
  const values = (["species", "nickname", "location", "purchaseDate", "notes"] as const).map(at);
  if (values.every((value) => value === "")) return "blank";
  return {
    line: record.line,
    species: at("species"),
    nickname: blankToNull(at("nickname")),
    location: blankToNull(at("location")),
    purchaseDate: parseDate(at("purchaseDate")),
    notes: blankToNull(at("notes")),
  };
}

/** The data rows under the header: the columns come from the header, more rows than the limit are refused. */
function rowsOf(records: readonly RawRecord[]): Result<ParsedRow[]> {
  const [header, ...data] = records;
  if (!header) return failed(unreadable());
  const columns = columnsOf(header.cells);
  if (!columns.ok) return columns;
  if (data.length > IMPORT_LIMITS.rows) return failed(appError("import.too_large"));
  const rows: ParsedRow[] = [];
  for (const record of data) {
    const row = rowOf(record, columns.value, header.cells.length);
    if (row === "ragged") return failed(unreadable());
    if (row !== "blank") rows.push(row);
  }
  return ok(rows);
}

/**
 * Parses the text of an import file (FR-BES-26): the size first, then the text itself, the separator from the header line,
 * the columns, and the row limit. Every refusal names one code. An unterminated quote leaves no header: unreadable.
 */
export function parseImportCsv(raw: string): Result<readonly ParsedRow[]> {
  const text = textOf(raw);
  if (!text.ok) return text;
  return rowsOf(splitRecords(text.value, detectSeparator(text.value)) ?? []);
}
