// Unique resources per worktree (US-DEV-08): port and database name are derived deterministically
// from the branch name, so parallel runs never share a test database or a port.
// Usage: node app/scripts/worktree-env.mjs <branch>   -> prints KEY=VALUE lines (for .env.worktree)
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const PORT_BASE = 54400; // assumption: range 54400-55899 is free; the fixed port 54329 stays with the main checkout
export const PORT_SLOTS = 500;

export function slug(branch) {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function worktreeEnv(branch) {
  if (!branch || !branch.trim()) throw new Error("branch name missing");
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
