import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest, parseArgs, runQuiet } from "./quiet.mjs";

test("US-DEV-12: parseArgs reads --tail, --log and the command after --", () => {
  assert.deepEqual(parseArgs(["--tail", "3", "--log", "x.log", "--", "make", "ci"]), {
    tail: 3,
    log: "x.log",
    command: ["make", "ci"],
  });
  assert.equal(parseArgs(["--", "ls"]).tail, 15);
  assert.throws(() => parseArgs(["--tail", "3"]), /command/);
});

test("US-DEV-12: digest lists failure lines and the last N lines, nothing else", () => {
  const lines = ["ok 1", "ok 2", "FAIL tests/a.test.ts", "ok 3", "Error: boom", "ok 4", "ok 5"];
  const out = digest(lines, 2);
  assert.deepEqual(out.failures, ["FAIL tests/a.test.ts", "Error: boom"]);
  assert.deepEqual(out.tail, ["ok 4", "ok 5"]);
});

test("US-DEV-12: digest caps failure lines at 20", () => {
  const lines = Array.from({ length: 50 }, (_, i) => `error ${i}`);
  assert.equal(digest(lines, 1).failures.length, 20);
});

test("US-DEV-12: success prints one line, keeps the full log and passes exit code 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "quiet-"));
  const log = join(dir, "run.log");
  const res = runQuiet({ tail: 5, log, command: [process.execPath, "-e", "console.log('hello')"] });
  assert.equal(res.code, 0);
  assert.equal(res.report.split("\n").length, 1);
  assert.match(res.report, /exit 0/);
  assert.ok(res.report.includes(log));
  assert.match(readFileSync(log, "utf8"), /hello/);
});

test("US-DEV-12: failure passes the exit code and reports failure lines, tail and log path", () => {
  const dir = mkdtempSync(join(tmpdir(), "quiet-"));
  const log = join(dir, "run.log");
  const script =
    "for(let i=0;i<40;i++)console.log('line '+i);console.error('Error: boom');process.exit(3)";
  const res = runQuiet({ tail: 4, log, command: [process.execPath, "-e", script] });
  assert.equal(res.code, 3);
  assert.match(res.report, /exit 3/);
  assert.match(res.report, /Error: boom/);
  assert.ok(res.report.includes(log));
  assert.ok(!res.report.includes("line 5\n"));
  assert.equal(readFileSync(log, "utf8").split("\n").filter(Boolean).length, 41);
});

test("US-DEV-12: a command that cannot start is a failure, not silence", () => {
  const dir = mkdtempSync(join(tmpdir(), "quiet-"));
  const res = runQuiet({
    tail: 3,
    log: join(dir, "r.log"),
    command: ["definitely-not-a-command-xyz"],
  });
  assert.notEqual(res.code, 0);
  assert.match(res.report, /exit/);
});
