// Tests for the gate decision log (US-QG-07, issue 2554): the signed line, the table the owner reads, and the append that never
// blocks a hook. Pure functions and temporary folders; the command line is tested in worktree.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendDecision, formatLog, LOG_FILE, logLine } from "./gate-log.mjs";
import { keyOf } from "./gate-seal.mjs";
import { namesRecord } from "./rules.mjs";

const KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);
const ENTRY = {
  time: "2026-11-26T19:00:00.000Z",
  branch: "fix/x",
  file: "Makefile",
  decision: "ask",
  source: "guard-edit",
  actor: "main",
  mode: "default",
  agent: null,
};

test("US-QG-07, issue 2554: the log file has the name of the hook records, so that no agent can name it in a command", () => {
  assert.equal(namesRecord(LOG_FILE), true, LOG_FILE);
});

test("US-QG-07, issue 2554: one log line is one JSON object: the fields in order, a missing field is null, and a MAC of the fields", () => {
  const line = logLine(ENTRY, KEY);
  assert.equal(line.includes("\n"), false);
  assert.deepEqual(Object.keys(JSON.parse(line)), [
    "time",
    "branch",
    "file",
    "decision",
    "source",
    "actor",
    "mode",
    "agent",
    "mac",
  ]);
  const { mac, ...fields } = JSON.parse(line);
  assert.deepEqual(fields, ENTRY);
  assert.match(mac, /^[0-9a-f]{64}$/);
  assert.equal(
    JSON.parse(logLine({ ...ENTRY, mode: undefined, agent: undefined }, KEY)).mode,
    null,
  );
});

test("US-QG-07, issue 2554: the table names no decision when the log is empty, and keeps the newest entries last", () => {
  assert.equal(formatLog(""), "no gate decisions logged");
  const text = [1, 2, 3].map((n) => logLine({ ...ENTRY, file: `f${n}.mjs` }, KEY)).join("\n");
  const table = formatLog(text, { limit: 2, key: KEY });
  const rows = table.split("\n");
  assert.match(rows[0], /^time\s+sig\s+decision\s+source\s+actor\s+mode\s+agent\s+branch\s+file$/);
  assert.equal(rows.length, 3);
  assert.doesNotMatch(table, /f1\.mjs/);
  assert.match(rows[1], /f2\.mjs$/);
  assert.match(rows[2], /f3\.mjs$/);
});

test("US-QG-07, issue 2554: a line with a wrong or missing MAC shows UNSIGNED, so a forged decision cannot pass for a signed one", () => {
  const signed = logLine(ENTRY, KEY);
  const forged = JSON.stringify({ ...ENTRY, decision: "applied" });
  const other = logLine(ENTRY, OTHER_KEY);
  const table = formatLog([signed, forged, other].join("\n"), { key: KEY });
  const rows = table.split("\n").slice(1);
  assert.match(rows[0], /^\S+\s+ok\s+ask\s/);
  assert.match(rows[1], /^\S+\s+UNSIGNED\s+applied\s/);
  assert.match(rows[2], /^\S+\s+UNSIGNED\s+ask\s/);
});

test("US-QG-07, issue 2554: the table shows a dash for a missing field, and says how many lines it could not read", () => {
  const text = `${logLine({ ...ENTRY, mode: null, agent: "implementer" }, KEY)}\nnot json\n`;
  const table = formatLog(text, { key: KEY });
  assert.match(table, /ok\s+ask\s+guard-edit\s+main\s+-\s+implementer\s+fix\/x\s+Makefile/);
  assert.match(table, /1 line could not be read/);
});

test("US-QG-07, issue 2554: an append adds one signed line to the log in the common git folder and reports nothing", () => {
  const common = mkdtempSync(join(tmpdir(), "gate-log-"));
  try {
    const warnings = [];
    appendDecision(common, ENTRY, (m) => warnings.push(m));
    appendDecision(common, { ...ENTRY, decision: "applied", source: "after-edit" }, (m) =>
      warnings.push(m),
    );
    const lines = readFileSync(join(common, LOG_FILE), "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[1]).decision, "applied");
    assert.deepEqual(warnings, []);
    const shown = formatLog(readFileSync(join(common, LOG_FILE), "utf8"), { key: keyOf(common) });
    assert.doesNotMatch(shown, /UNSIGNED/);
  } finally {
    rmSync(common, { recursive: true, force: true });
  }
});

test("US-QG-07, issue 2554: a log that cannot be written warns once and does not throw, so the hook never blocks", () => {
  const missing = join(tmpdir(), "gate-log-missing-folder", "none");
  const warnings = [];
  assert.doesNotThrow(() => appendDecision(missing, ENTRY, (m) => warnings.push(m)));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^hook: the gate decision could not be logged \(/);
});
