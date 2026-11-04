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
