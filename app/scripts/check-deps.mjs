// Dependencies out of date? (#394) `make setup` writes the SHA-256 of package-lock.json into
// node_modules/.setup-lock-hash. Hooks, `make gates` and the claim preflight compare it, so a pull that changed the
// lock file stops with "run make setup" instead of failing later in tsc ("Cannot find module ...").
// Usage: node check-deps.mjs          exit 1 and name the reason when node_modules is missing or stale
//        node check-deps.mjs --stamp  record the current lock file (called by `make setup` after npm ci)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const STAMP = "node_modules/.setup-lock-hash";

const lockHash = (appDir) =>
  createHash("sha256")
    .update(readFileSync(path.join(appDir, "package-lock.json")))
    .digest("hex");

/** Reasons why the installed dependencies cannot be trusted; empty means up to date. */
export function depsFindings(appDir = APP_DIR) {
  if (!existsSync(path.join(appDir, "node_modules")))
    return ["node_modules missing: run `make setup` first"];
  if (!existsSync(path.join(appDir, "package-lock.json"))) return [];
  const stamp = path.join(appDir, STAMP);
  if (!existsSync(stamp))
    return ["dependencies were installed without a record of the lock file: run `make setup`"];
  if (readFileSync(stamp, "utf8").trim() !== lockHash(appDir))
    return [
      "dependencies are out of date (package-lock.json changed since `make setup`): run `make setup`",
    ];
  return [];
}

export function stamp(appDir = APP_DIR) {
  if (existsSync(path.join(appDir, "package-lock.json")))
    writeFileSync(path.join(appDir, STAMP), `${lockHash(appDir)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--stamp") stamp();
  else {
    const findings = depsFindings();
    for (const f of findings) console.error(`check-deps: ${f}`);
    process.exit(findings.length ? 1 : 0);
  }
}
