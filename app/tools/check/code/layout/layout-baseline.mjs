// LY-6: the baseline only shrinks (FR-QG-22). Shape: { "LY-1": { "<dir>": <value> }, ... }.

export function toBaseline(findings) {
  const out = {};
  for (const f of [...findings].sort((a, b) => a.dir.localeCompare(b.dir))) {
    (out[f.rule] ??= {})[f.dir] = f.value;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

// What to do next, per rule (P-09).
const NEXT = {
  "LY-1": "group the entries into subfolders or declare a collection in app/layout.config.mjs",
  "LY-2": "rename the entry to the name pattern of its collection",
  "LY-3": "rename it to kebab-case",
  "LY-4": "move the component x.tsx into a folder x/",
  "LY-5": "move it under app/, docs/ or tools/ (or add it to the root whitelist in the config)",
};

const hint = (f) => `${f.items.slice(0, 3).join(", ")}${f.items.length > 3 ? ", ..." : ""}`;

// Compares the measured findings with the baseline and, when given, with the baseline on dev.
export function compareBaseline(findings, baseline, devBaseline) {
  const errors = [];
  const seen = new Set();
  for (const f of findings) {
    const known = baseline[f.rule]?.[f.dir];
    seen.add(`${f.rule} ${f.dir}`);
    if (known === undefined)
      errors.push(
        `${f.rule} ${f.dir}: ${f.value} (${hint(f)}); new violations are not allowed: ${NEXT[f.rule]}`,
      );
    else if (f.value > known)
      errors.push(
        `${f.rule} ${f.dir}: ${f.value}, baseline allows ${known}; the directory got worse: ${NEXT[f.rule]}`,
      );
    else if (f.value < known)
      errors.push(
        `LY-6 ${f.rule} ${f.dir}: now ${f.value}, baseline says ${known}; lower the entry`,
      );
  }
  for (const [rule, dirs] of Object.entries(baseline))
    for (const dir of Object.keys(dirs))
      if (!seen.has(`${rule} ${dir}`))
        errors.push(`LY-6 ${rule} ${dir}: no longer violates; delete the entry`);
  if (devBaseline)
    for (const [rule, dirs] of Object.entries(baseline))
      for (const [dir, value] of Object.entries(dirs)) {
        const dev = devBaseline[rule]?.[dir];
        if (dev === undefined)
          errors.push(
            `LY-6 ${rule} ${dir}: entry is not on dev; the baseline must not get new entries`,
          );
        else if (value > dev)
          errors.push(`LY-6 ${rule} ${dir}: ${value} is higher than ${dev} on dev`);
      }
  return errors;
}
