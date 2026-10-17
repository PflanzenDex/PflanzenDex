// Migration numbering (issue #831): pure helpers shared by `make migration`, `make claim` and the check.
// Two branches that both take "the next number" collide after the second merge; so the next number is
// chosen with a view on origin/dev AND every open PR branch AND numbers reserved in a PR Handoff.
export const MIGRATIONS_DIR = "app/packages/db/migrations";
export const RESERVED_LABEL = "Migration number";

const FILE = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** Number of a migration file name (path or basename), or undefined when it is not a migration. */
export function numberOf(file) {
  const m = FILE.exec(file.split("/").pop() ?? "");
  return m ? Number(m[1]) : undefined;
}

export const pad = (n) => String(n).padStart(4, "0");

/** The reserved number from a PR body ("- **Migration number:** 0067"), or undefined. */
export function reservedIn(body) {
  const m = new RegExp(`${RESERVED_LABEL}:\\**\\s*(\\d{4})\\b`, "i").exec(body ?? "");
  return m ? Number(m[1]) : undefined;
}

/**
 * Next free number. `taken` are numbers on origin/dev, in open PR branches, in the working tree and reserved
 * by other PRs. `own` is the number reserved for this branch's PR: used when it is still free.
 */
export function nextNumber({ taken, own }) {
  const used = new Set(taken);
  if (own !== undefined && !used.has(own)) return own;
  return Math.max(0, ...used) + 1;
}

/** Problems of a migration directory: duplicate numbers, and new files not above the maximum on dev. */
export function findProblems({ files, devFiles }) {
  const problems = [];
  const byNumber = new Map();
  for (const f of files) {
    const n = numberOf(f);
    if (n !== undefined) byNumber.set(n, [...(byNumber.get(n) ?? []), f]);
  }
  for (const [n, list] of byNumber)
    if (list.length > 1) problems.push(`number ${pad(n)} is used twice: ${list.join(", ")}`);
  if (devFiles) {
    const known = new Set(devFiles);
    const max = Math.max(0, ...devFiles.map(numberOf).filter((n) => n !== undefined));
    for (const f of files) {
      const n = numberOf(f);
      if (n !== undefined && !known.has(f) && n <= max)
        problems.push(
          `${f} is new but ${pad(n)} is not above ${pad(max)}, the highest on origin/dev: renumber it (make migration)`,
        );
    }
  }
  return problems;
}
