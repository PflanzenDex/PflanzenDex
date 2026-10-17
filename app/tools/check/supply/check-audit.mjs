// Dependency audit gate (QG-S2): runs `npm audit --json` and fails on any high/critical advisory that is not in
// `audit-allowlist.json`, or whose allowlist entry has expired. Moderate and low advisories are ignored
// (same as `npm audit --audit-level=high`). Allowlisted advisories that no longer appear only produce a hint.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BLOCKING = new Set(["high", "critical"]);

/** Collects advisories (objects in `via`) of high/critical severity, keyed by GHSA id. */
export function collectAdvisories(audit) {
  const found = new Map();
  for (const [name, vuln] of Object.entries(audit.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== "object" || !BLOCKING.has(via.severity)) continue;
      const id = /GHSA-[\w-]+/.exec(via.url ?? "")?.[0] ?? via.url ?? String(via.source);
      if (!found.has(id)) found.set(id, { id, package: via.name ?? name, severity: via.severity });
    }
  }
  return [...found.values()];
}

/** @returns {{ok: boolean, errors: string[], tolerated: string[], hints: string[]}} */
export function checkAudit({ audit, allowlist, today }) {
  const entries = new Map(allowlist.entries.map((e) => [e.advisory, e]));
  const advisories = collectAdvisories(audit);
  const errors = [];
  const tolerated = [];
  for (const adv of advisories) {
    const entry = entries.get(adv.id);
    if (!entry) {
      errors.push(`${adv.id} (${adv.package}, ${adv.severity}) is not in audit-allowlist.json`);
    } else if (entry.expires < today) {
      errors.push(
        `${adv.id} (${adv.package}): allowlist entry expired on ${entry.expires}, re-review it (patched release? then update the dependency, else extend with a new reason)`,
      );
    } else {
      tolerated.push(`${adv.id} (${adv.package}) until ${entry.expires}: ${entry.reason}`);
    }
  }
  const seen = new Set(advisories.map((a) => a.id));
  const hints = allowlist.entries
    .filter((e) => !seen.has(e.advisory))
    .map(
      (e) => `${e.advisory} (${e.package}) no longer appears, remove it from audit-allowlist.json`,
    );
  return { ok: errors.length === 0, errors, tolerated, hints };
}

function main() {
  const run = spawnSync("npm", ["audit", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let audit;
  try {
    audit = JSON.parse(run.stdout);
  } catch {
    console.error(`audit: could not parse npm audit output\n${run.stderr}`);
    return 2;
  }
  if (audit.error) {
    console.error(`audit: npm audit failed: ${audit.error.summary ?? JSON.stringify(audit.error)}`);
    return 2;
  }
  const allowlist = JSON.parse(
    readFileSync(new URL("../../../config/gates/audit-allowlist.json", import.meta.url), "utf8"),
  );
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const result = checkAudit({ audit, allowlist, today });
  for (const t of result.tolerated) console.log(`audit: tolerated ${t}`);
  for (const h of result.hints) console.log(`audit: hint: ${h}`);
  for (const e of result.errors) console.error(`audit: FAIL ${e}`);
  if (result.ok) console.log("audit: no unlisted high/critical advisories");
  return result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
