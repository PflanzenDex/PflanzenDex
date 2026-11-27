// CODEOWNERS sync check (US-QG-07, issue 2556, owner decisions d-146, d-155). .github/CODEOWNERS owns the gate paths and
// nothing else: every path that isGateFile of .claude/hooks/rules.mjs marks needs a line with the three owners (any one
// approval is enough), and no line may own a file that is no gate file (no `*` default line). The one list of gate paths
// stays isGateFile; this check never keeps a second one. It judges the files that git tracks, so a new gate file without
// a covering line, or a line that reaches a non-gate file, fails `make gates` in the pull request that adds it.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isGateFile } from "../../../../../.claude/hooks/rules.mjs";
import { isEntryPoint } from "../../shared/entry-point.mjs";

export const REQUIRED_OWNERS = ["@konradhe14", "@MaxNize", "@NiklasKoch-14"];

/** Parses CODEOWNERS text into { line, pattern, owners } entries; comments and blank lines are dropped. */
export function parseCodeowners(text) {
  return text.split("\n").flatMap((raw, index) => {
    const content = raw.replace(/(^|\s)#.*$/, "").trim();
    if (!content) return [];
    const [pattern, ...owners] = content.split(/\s+/);
    return [{ line: index + 1, pattern, owners }];
  });
}

const escapeChar = (c) => c.replace(/[.+^${}()|[\]\\]/g, "\\$&");

/** The gitignore-style pattern of a CODEOWNERS line as a regular expression over repo-relative paths. */
export function patternToRegExp(pattern) {
  const anchored = pattern.startsWith("/") || pattern.slice(0, -1).includes("/");
  const body = pattern.replace(/^\//, "");
  let source = "";
  for (let i = 0; i < body.length; i += 1) {
    const rest = body.slice(i);
    if (rest.startsWith("**/")) {
      source += "(?:.*/)?";
      i += 2;
    } else if (rest.startsWith("**")) {
      source += ".*";
      i += 1;
    } else if (body[i] === "*") source += "[^/]*";
    else if (body[i] === "?") source += "[^/]";
    else source += escapeChar(body[i]);
  }
  source = source.replace(/\/$/, "");
  // eslint-disable-next-line security/detect-non-literal-regexp -- built from our own CODEOWNERS, every character escaped above
  return new RegExp(`^${anchored ? "" : "(?:.*/)?"}${source}(?:/.*)?$`);
}

const hasWildcard = (pattern) => /[*?]/.test(pattern);

/**
 * The problems of CODEOWNERS against the tracked files: a line without the three owners, a line that owns a file that
 * is no gate file, a line that names a literal path that is no gate path, and a gate file no line covers.
 */
export function checkCodeowners({ text, files, isGate = isGateFile }) {
  const problems = [];
  const entries = parseCodeowners(text);
  const matchers = entries.map((entry) => ({ ...entry, test: patternToRegExp(entry.pattern) }));
  for (const entry of matchers) {
    const where = `CODEOWNERS line ${entry.line} (${entry.pattern})`;
    const missing = REQUIRED_OWNERS.filter((owner) => !entry.owners.includes(owner));
    if (missing.length || entry.owners.length !== REQUIRED_OWNERS.length)
      problems.push(`${where}: owners must be ${REQUIRED_OWNERS.join(" ")}`);
    const reached = files.filter((file) => entry.test.test(file));
    const strangers = reached.filter((file) => !isGate(file));
    if (strangers.length)
      problems.push(
        `${where}: owns ${strangers.length} file(s) that are no gate files, for example ${strangers[0]}`,
      );
    if (!reached.length && !hasWildcard(entry.pattern)) {
      const probe = entry.pattern.endsWith("/")
        ? `${entry.pattern.slice(1)}x`
        : entry.pattern.slice(1);
      if (!isGate(probe)) problems.push(`${where}: names a path that is no gate path`);
    }
  }
  for (const file of files)
    if (isGate(file) && !matchers.some((entry) => entry.test.test(file)))
      problems.push(`gate file ${file} has no CODEOWNERS line`);
  return problems;
}

if (isEntryPoint(import.meta.url)) {
  const root = fileURLToPath(new URL("../../../../..", import.meta.url));
  const listed = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  if (listed.status !== 0) {
    console.error(`check-codeowners: git ls-files failed: ${listed.stderr.trim()}`);
    process.exit(1);
  }
  const files = listed.stdout.split("\0").filter(Boolean);
  const text = fs.readFileSync(path.join(root, ".github/CODEOWNERS"), "utf8");
  const problems = checkCodeowners({ text, files });
  problems.forEach((p) => console.error(`check-codeowners: ${p}`));
  if (problems.length) process.exit(1);
  console.log("check-codeowners: every gate file has an owner line and no other file has one");
}
