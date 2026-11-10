// US-QG-07: the statements of a request that repeat by design are not findings: the transaction, the role and the
// account setup of `withAccount` and of the sign-in guard (db `withAccount`, `lookUp`).
/** Characters of a statement that a finding keeps (the baseline names the text by its first characters). */
const FINDING_CHARS = 100;
const FRAME =
  /^(begin|commit|rollback|savepoint|release savepoint|rollback to savepoint|set local role\b|select set_config\()/i;

/** Whitespace collapsed; the text identity decides a repeat, parameters are not looked at (N+1, duplicate read). */
export const normalize = (sql: string): string => sql.replace(/\s+/g, " ").trim();

/** A statement text that a request sends more than once: its first characters and how often it was sent (US-QG-07). */
export type Repeat = { readonly finding: string; readonly count: number };

/** Every statement text that a request sends more than once, without the frame, with its count (US-QG-07, #1306). */
export function repeatCounts(statements: readonly string[]): Repeat[] {
  const seen = new Map<string, number>();
  for (const sql of statements) {
    const text = normalize(sql);
    if (FRAME.test(text)) continue;
    seen.set(text, (seen.get(text) ?? 0) + 1);
  }
  return [...seen]
    .filter(([, n]) => n > 1)
    .map(([text, count]) => ({ finding: text.slice(0, FINDING_CHARS), count }));
}

/** The first 100 characters of every statement text that a request sends more than once, without the frame. */
export function repeatFindings(statements: readonly string[]): string[] {
  return repeatCounts(statements).map((r) => r.finding);
}

/**
 * The owner rule (US-QG-07, #1306): a statement text may be sent at most once per owner of the fixture, so a read per
 * friend passes and a read per offer (N+1) does not. The bound is the owner count of the fixture for every statement,
 * not a per-route number, and a prefix listed in the baseline does not lift it.
 */
export function repeatsOverOwners(statements: readonly string[], owners: number): Repeat[] {
  return repeatCounts(statements).filter((r) => r.count > owners);
}

/**
 * Literal values (ids, subjects, quoted texts) left out of a tally: the same statement of two keepers differs only in
 * them.
 */
const shape = (sql: string): string =>
  normalize(sql)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "?")
    .replace(/'[^']*'/g, "'?'");

/**
 * The statements of both sizes in the order sent, and what only the larger side sent, for a growth failure (US-QG-07,
 * #1301): the extra statement is named by its text, not only by its count. Texts are normalized like `repeatFindings`;
 * the "sent only" tallies also leave out the literal values.
 */
export function growthReport(
  small: { size: number; statements: readonly string[] },
  large: { size: number; statements: readonly string[] },
): string {
  const listed = (side: { size: number; statements: readonly string[] }) => [
    `statements for ${side.size} specimens (${side.statements.length}):`,
    ...side.statements.map((sql, i) => `  ${i + 1}. ${normalize(sql)}`),
  ];
  const tally = (texts: readonly string[]) => {
    const counts = new Map<string, number>();
    for (const sql of texts) counts.set(shape(sql), (counts.get(shape(sql)) ?? 0) + 1);
    return counts;
  };
  const extra = (a: Map<string, number>, b: Map<string, number>) =>
    [...a]
      .map(([text, n]) => [text, n - (b.get(text) ?? 0)] as const)
      .filter(([, d]) => d > 0)
      .map(([text, d]) => `  ${d} x ${text}`);
  const onlyLarge = extra(tally(large.statements), tally(small.statements));
  const onlySmall = extra(tally(small.statements), tally(large.statements));
  return [
    ...listed(small),
    ...listed(large),
    `sent only for ${large.size} specimens:`,
    ...(onlyLarge.length > 0 ? onlyLarge : ["  (none)"]),
    `sent only for ${small.size} specimens:`,
    ...(onlySmall.length > 0 ? onlySmall : ["  (none)"]),
  ].join("\n");
}
