// Preflight of `make claim` (US-DEV-08, #251): everything a later claim step needs is checked before the
// first write, so a claim never stops half way (e.g. the pre-push hook failing without node_modules).
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export class PreflightFailed extends Error {
  constructor(findings) {
    super(findings.map((f) => `  - ${f}`).join("\n"));
    this.findings = findings;
  }
}

const APP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function preflight(
  client,
  { hasModules = existsSync(path.join(APP_DIR, "node_modules")) } = {},
) {
  const findings = [];
  if (!hasModules)
    findings.push("node_modules missing: run `make setup` first (the pre-push hook needs it)");
  try {
    await client.run("git", ["cat-file", "-e", "origin/dev:Makefile"]);
  } catch {
    findings.push(
      "origin/dev has no Makefile: fetch failed or the checkout is ancient; use a fresh checkout of dev",
    );
  }
  if (findings.length) throw new PreflightFailed(findings);
}
