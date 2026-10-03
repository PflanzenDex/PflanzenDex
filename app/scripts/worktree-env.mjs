// Eindeutige Ressourcen je Worktree (US-DEV-08): Port und Datenbankname werden deterministisch
// aus dem Branch-Namen abgeleitet, damit parallele Läufe nie dieselbe Test-Datenbank oder denselben Port teilen.
// Aufruf: node app/scripts/worktree-env.mjs <branch>   -> gibt KEY=WERT-Zeilen aus (für .env.worktree)
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const PORT_BASE = 54400; // Annahme: Bereich 54400-55899 ist frei; fester Port 54329 bleibt dem Hauptverzeichnis
export const PORT_SLOTS = 500;

export function slug(branch) {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function worktreeEnv(branch) {
  if (!branch || !branch.trim()) throw new Error("Branch-Name fehlt");
  const hash = createHash("sha256").update(branch).digest();
  const slot = hash.readUInt32BE(0) % PORT_SLOTS;
  return {
    PFLANZENDEX_TEST_DB_PORT: String(PORT_BASE + slot),
    PFLANZENDEX_TEST_DB_NAME: `pflanzendex_${slug(branch)}_${hash.toString("hex").slice(0, 6)}`,
    PFLANZENDEX_DEV_API_PORT: String(PORT_BASE + PORT_SLOTS + slot),
    PFLANZENDEX_DEV_WEB_PORT: String(PORT_BASE + 2 * PORT_SLOTS + slot),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    for (const [k, v] of Object.entries(worktreeEnv(process.argv[2]))) console.log(`${k}=${v}`);
  } catch (e) {
    console.error(`worktree-env: ${e.message}`);
    process.exit(1);
  }
}
