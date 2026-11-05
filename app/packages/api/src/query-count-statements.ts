// US-QG-07: the statements of a request that repeat by design are not findings: the transaction, the role and the
// account setup of `withAccount` and of the sign-in guard (db `withAccount`, `lookUp`).
/** Characters of a statement that a finding keeps (the baseline names the text by its first characters). */
const FINDING_CHARS = 100;
const FRAME =
  /^(begin|commit|rollback|savepoint|release savepoint|rollback to savepoint|set local role\b|select set_config\()/i;

/** Whitespace collapsed; the text identity decides a repeat, parameters are not looked at (N+1, duplicate read). */
export const normalize = (sql: string): string => sql.replace(/\s+/g, " ").trim();

/** The first 100 characters of every statement text that a request sends more than once, without the frame. */
export function repeatFindings(statements: readonly string[]): string[] {
  const seen = new Map<string, number>();
  for (const sql of statements) {
    const text = normalize(sql);
    if (FRAME.test(text)) continue;
    seen.set(text, (seen.get(text) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([text]) => text.slice(0, FINDING_CHARS));
}

/**
 * The statements of both sizes in the order sent, and what only the larger side sent, for a growth failure (US-QG-07,
 * #1301): the extra statement is named by its text, not only by its count. Texts are normalized like `repeatFindings`.
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
    for (const sql of texts) counts.set(normalize(sql), (counts.get(normalize(sql)) ?? 0) + 1);
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
