// The baseline only shrinks (same idea as FR-QG-22). Shape: { "<table>": ["account_id", "fk(col, col)"] }.

export function toBaseline(findings) {
  const out = {};
  for (const f of [...findings].sort(
    (a, b) => a.table.localeCompare(b.table) || a.target.localeCompare(b.target),
  ))
    (out[f.table] ??= []).push(f.target);
  return out;
}

const NEXT =
  "add an index in a migration (db-migration skill) so that its leading column(s) are the listed ones";

// Compares the findings with the baseline and, when given, with the baseline on dev.
export function compareBaseline(findings, baseline, devBaseline) {
  const errors = [];
  const key = (table, target) => `${table} ${target}`;
  const seen = new Set(findings.map((f) => key(f.table, f.target)));
  for (const f of findings)
    if (!baseline[f.table]?.includes(f.target))
      errors.push(
        `${f.table}: ${f.target} has no covering index; new violations are not allowed: ${NEXT}`,
      );
  for (const [table, targets] of Object.entries(baseline))
    for (const target of targets) {
      if (!seen.has(key(table, target)))
        errors.push(`${table}: ${target} is covered now; delete the baseline entry`);
      else if (devBaseline && !devBaseline[table]?.includes(target))
        errors.push(
          `${table}: ${target} is not in the baseline on dev; the baseline must not get new entries`,
        );
    }
  return errors;
}
