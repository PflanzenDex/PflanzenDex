#!/usr/bin/env node
// US-DEV-12: compact PR check status. One query, no polling.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// gh 2.45 has no --json for `gh pr checks`: parse the tab-separated lines (name, state, elapsed, url).
export function parseChecks(text) {
  return text
    .split("\n")
    .filter((l) => l.includes("\t"))
    .map((l) => {
      const [name, bucket] = l.split("\t");
      return { name, bucket };
    });
}

export function summarizeChecks(checks) {
  if (checks.length === 0) return "no checks reported yet";
  const by = (b) => checks.filter((c) => c.bucket === b).map((c) => c.name);
  const green = by("pass");
  const red = [...by("fail"), ...by("cancel")];
  const open = by("pending");
  const lines = [`${green.length} green, ${open.length} open, ${red.length} red`];
  if (red.length) lines.push(`red: ${red.join(", ")}`);
  if (open.length) lines.push(`open: ${open.join(", ")}`);
  return lines.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pr = process.argv[2];
  if (!/^\d+$/.test(pr ?? "")) {
    console.error("usage: node app/tools/dev/agent/pr-status.mjs <pr-number>");
    process.exit(2);
  }
  let text;
  try {
    text = execFileSync("gh", ["pr", "checks", pr], { encoding: "utf8" });
  } catch (e) {
    // gh exits non-zero while checks are failing or pending but still prints the table
    text = e.stdout?.toString() ?? "";
    if (!text) {
      console.error(`gh pr checks failed: ${e.stderr?.toString().trim() || e.message}`);
      process.exit(1);
    }
  }
  console.log(summarizeChecks(parseChecks(text)));
}
