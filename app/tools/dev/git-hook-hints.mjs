// Hints after `post-merge`/`post-checkout` (US-DEV-02): names the follow-up steps but never runs them.
// Usage: node git-hook-hints.mjs <old-commit> <new-commit>
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RULES = [
  {
    pattern: /^app\/(package-lock\.json|packages\/[^/]+\/package\.json|package\.json)$/,
    hint: "Dependencies changed: run make setup",
  },
  { pattern: /^app\/packages\/db\/migrations\//, hint: "New migrations: run make migrate" },
  { pattern: /^\.githooks\//, hint: "Git hooks changed: run make hooks" },
  { pattern: /^\.nvmrc$/, hint: "Node version changed: see .nvmrc" },
];

export function hintsFor(changedFiles) {
  return RULES.filter(({ pattern }) => changedFiles.some((f) => pattern.test(f))).map(
    ({ hint }) => hint,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [from, to] = process.argv.slice(2);
  if (!from || !to || from === to) process.exit(0);
  try {
    const out = execFileSync("git", ["diff", "--name-only", from, to], { encoding: "utf8" });
    for (const hint of hintsFor(out.split("\n").filter(Boolean))) console.log(`Hint: ${hint}`);
  } catch {
    // A hint hook must never get in the way of a checkout or merge (US-DEV-02).
  }
}
