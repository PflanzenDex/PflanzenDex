// Hinweise nach `post-merge`/`post-checkout` (US-DEV-02): nennt nötige Folgeschritte, führt aber nichts selbst aus.
// Aufruf: node git-hook-hints.mjs <alter-commit> <neuer-commit>
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RULES = [
  {
    pattern: /^app\/(package-lock\.json|packages\/[^/]+\/package\.json|package\.json)$/,
    hint: "Abhängigkeiten geändert: make setup",
  },
  { pattern: /^app\/packages\/db\/migrations\//, hint: "Neue Migrationen: make migrate" },
  { pattern: /^\.githooks\//, hint: "Git-Hooks geändert: make hooks" },
  { pattern: /^\.nvmrc$/, hint: "Node-Version geändert: siehe .nvmrc" },
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
    for (const hint of hintsFor(out.split("\n").filter(Boolean))) console.log(`Hinweis: ${hint}`);
  } catch {
    // Ein Hinweis-Hook darf nie einen Checkout oder Merge stören (US-DEV-02).
  }
}
