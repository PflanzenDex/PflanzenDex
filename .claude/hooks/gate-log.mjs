#!/usr/bin/env node
// The gate decision log (US-QG-07, issue 2554): one JSON line per decision of the hook on a gate file, in the git common folder
// that every worktree of the repository shares. `make gate-log` prints it for the owner, newest last. The file name must match
// the record pattern of rules.mjs (namesRecord), so that no agent can name the log in a command. Each line carries an HMAC of its
// fields (gate-seal.mjs); a line without a matching MAC is shown as UNSIGNED. The file access and the command line are below.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { keyOf, macOf } from "./gate-seal.mjs";

// The name of the log file. It is set in the copy that goes into .claude/hooks/ (issue 2554), because the draft folder is no
// place where a record name can be written (the record guard of rules.mjs refuses it there).
export const LOG_FILE = "claude-gate-log.jsonl";

const FIELDS = ["time", "branch", "file", "decision", "source", "actor", "mode", "agent"];
const DEFAULT_LIMIT = 50;

// The signed text of a decision: its fields in order, a missing field is null.
const bodyOf = (entry) =>
  JSON.stringify(Object.fromEntries(FIELDS.map((f) => [f, entry[f] ?? null])));

// One decision as a JSON line without a line break: the fields and the MAC of their text.
export function logLine(entry, key) {
  const body = JSON.parse(bodyOf(entry));
  return JSON.stringify({ ...body, mac: macOf(key, bodyOf(body)) });
}

// Whether a parsed line carries the MAC of its fields.
const signedBy = (line, key) => {
  const { mac, ...rest } = line;
  return typeof mac === "string" && mac === macOf(key, bodyOf(rest));
};

// The table the owner reads: the newest `limit` decisions, newest last. A line that is not JSON is counted in a note, never
// dropped silently (P-10). A line without a matching MAC is marked UNSIGNED in the sig column.
export function formatLog(text, { limit = DEFAULT_LIMIT, key = null } = {}) {
  const entries = [];
  let unreadable = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed = JSON.parse(line);
      entries.push({ ...parsed, sig: key !== null && signedBy(parsed, key) ? "ok" : "UNSIGNED" });
    } catch {
      unreadable++;
    }
  }
  const shown = limit > 0 ? entries.slice(-limit) : entries;
  const notes =
    unreadable > 0
      ? [`${unreadable} ${unreadable === 1 ? "line" : "lines"} could not be read`]
      : [];
  if (shown.length === 0) return ["no gate decisions logged", ...notes].join("\n");
  const header = ["time", "sig", "decision", "source", "actor", "mode", "agent", "branch", "file"];
  const table = [header, ...shown.map((e) => header.map((field) => String(e[field] ?? "-")))];
  const widths = header.map((_, c) => Math.max(...table.map((row) => row[c].length)));
  const lines = table.map((row) =>
    row
      .map((cell, c) => cell.padEnd(widths[c]))
      .join("  ")
      .trimEnd(),
  );
  return [...lines, ...notes].join("\n");
}

// Appends one signed decision to the log of the repository, whose common git folder is `commonDir`. A failure is reported
// through `warn` in one line and never thrown: a hook must not block (issue 2554).
export function appendDecision(commonDir, entry, warn = (text) => process.stderr.write(text)) {
  try {
    const time = new Date().toISOString();
    const line = logLine({ time, ...entry }, keyOf(commonDir));
    fs.appendFileSync(path.join(commonDir, LOG_FILE), `${line}\n`);
  } catch (error) {
    warn(`hook: the gate decision could not be logged (${error.message.split("\n")[0]})\n`);
  }
}

// `make gate-log [limit]`: the decisions of the repository, from any worktree of it.
function show() {
  const requested = Number(process.argv[2] ?? DEFAULT_LIMIT);
  const limit = Number.isInteger(requested) && requested > 0 ? requested : DEFAULT_LIMIT;
  const common = path.resolve(
    execFileSync("git", ["rev-parse", "--git-common-dir"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim(),
  );
  const file = path.join(common, LOG_FILE);
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  process.stdout.write(`${formatLog(text, { limit, key: keyOf(common) })}\n`);
}

// Runs only as the command line of this file: the hook imports the functions above and must not print anything.
const isCommandLine =
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (isCommandLine) {
  try {
    show();
  } catch (error) {
    process.stderr.write(`gate-log: ${error.message.split("\n")[0]}\n`);
    process.exitCode = 1;
  }
}
