// Preflight of `make claim` (US-DEV-08, #251): everything a later claim step needs is checked before the
// first write, so a claim never stops half way (e.g. the pre-push hook failing without node_modules).
import { depsFindings } from "../../check/supply/check-deps.mjs";

export class PreflightFailed extends Error {
  constructor(findings) {
    super(findings.map((f) => `  - ${f}`).join("\n"));
    this.findings = findings;
  }
}

export async function preflight(client, { depsProblems = depsFindings() } = {}) {
  const findings = depsProblems.map((f) => `${f} (the pre-push hook needs it)`);
  try {
    await client.run("git", ["cat-file", "-e", "origin/dev:Makefile"]);
  } catch {
    findings.push(
      "origin/dev has no Makefile: fetch failed or the checkout is ancient; use a fresh checkout of dev",
    );
  }
  if (findings.length) throw new PreflightFailed(findings);
}
