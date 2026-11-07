// Records of the import file (US-BES-18, FR-BES-26): RFC 4180 quoting, so a quoted field may hold the separator and line
// breaks, and two quotes inside a quoted field are one quote. Blank lines are no records. Pure text, no I/O (AB-1).

export type Separator = "," | ";";

/** A record and the physical line it starts on (the header is line 1). */
export interface RawRecord {
  readonly line: number;
  readonly cells: readonly string[];
}

const isLineBreak = (ch: string): boolean => ch === "\n" || ch === "\r";

/** The header line: the text up to the first line break that is not inside quotes. */
function headerLineOf(text: string): string {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === '"') quoted = !quoted;
    else if (!quoted && isLineBreak(ch)) return text.slice(0, i);
  }
  return text;
}

/** How often `sep` occurs in the line outside quotes. */
function unquotedCount(line: string, sep: Separator): number {
  let quoted = false;
  let count = 0;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === sep) count += 1;
  }
  return count;
}

/** The separator of the header line: the one that occurs more often outside quotes; a tie or none is the comma. */
export function detectSeparator(text: string): Separator {
  const line = headerLineOf(text);
  return unquotedCount(line, ";") > unquotedCount(line, ",") ? ";" : ",";
}

interface Reader {
  cells: string[];
  cell: string;
  /** Something other than a line break was read for the current record (a blank line is no record). */
  touched: boolean;
  inQuotes: boolean;
  /** The physical line the current record starts on. */
  start: number;
  /** The physical line being read. */
  line: number;
  records: RawRecord[];
}

function endRecord(r: Reader): void {
  if (r.touched) {
    r.cells.push(r.cell);
    r.records.push({ line: r.start, cells: r.cells });
  }
  r.cells = [];
  r.cell = "";
  r.touched = false;
}

/** A line break outside quotes ends the record; the next record starts on the next line. */
function lineBreak(r: Reader): void {
  endRecord(r);
  r.line += 1;
  r.start = r.line;
}

/** One character inside quotes: a doubled quote is one quote, a single one closes the field; returns the last index used. */
function quotedStep(r: Reader, text: string, i: number): number {
  const c = text.charAt(i);
  if (c !== '"') {
    r.cell += c;
    if (c === "\n") r.line += 1;
    return i;
  }
  if (text.charAt(i + 1) === '"') {
    r.cell += '"';
    return i + 1;
  }
  r.inQuotes = false;
  return i;
}

/** One character outside quotes. */
function plainStep(r: Reader, text: string, i: number, separator: Separator): void {
  const c = text.charAt(i);
  if (c === "\r" && text.charAt(i + 1) === "\n") return;
  if (c === '"' && r.cell === "") {
    r.inQuotes = true;
    r.touched = true;
    return;
  }
  if (c === separator) {
    r.cells.push(r.cell);
    r.cell = "";
    r.touched = true;
    return;
  }
  if (c === "\n" || c === "\r") {
    lineBreak(r);
    return;
  }
  r.cell += c;
  r.touched = true;
}

/**
 * Splits the text into records. `null` for an unterminated quoted field (the file is not readable as a table). The text
 * must not start with a byte order mark; the caller strips it.
 */
export function splitRecords(text: string, separator: Separator): readonly RawRecord[] | null {
  const r: Reader = {
    cells: [],
    cell: "",
    touched: false,
    inQuotes: false,
    start: 1,
    line: 1,
    records: [],
  };
  for (let i = 0; i < text.length; i++) {
    if (r.inQuotes) i = quotedStep(r, text, i);
    else plainStep(r, text, i, separator);
  }
  if (r.inQuotes) return null;
  endRecord(r);
  return r.records;
}
