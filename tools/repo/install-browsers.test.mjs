// US-QG-01 (issue 1485): install-browsers.sh stops a stalled part after its limit, retries it once and fails when the retry
// fails too. Stand-ins for npx and sudo come first on PATH: nothing is installed and no process is killed on this machine.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const SCRIPT = new URL("./install-browsers.sh", import.meta.url).pathname;
// The stall needs GNU timeout (macOS has none by default), so the tests are skipped without it.
const hasTimeout = spawnSync("sh", ["-c", "command -v timeout"]).status === 0;

// npx stand-in: logs its arguments and answers each call of its part with the next outcome of the plan (ok, fail or stall);
// calls beyond the plan succeed.
const NPX = `#!/bin/sh
echo "npx $*" >> "$BROWSER_TEST_LOG"
case "$*" in *install-deps*) part=deps ;; *) part=download ;; esac
count_file="$BROWSER_TEST_DIR/$part.count"
n=$(cat "$count_file" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$count_file"
case "$part" in deps) plan=$BROWSER_TEST_PLAN_DEPS ;; *) plan=$BROWSER_TEST_PLAN_DOWNLOAD ;; esac
outcome=$(printf '%s\\n' $plan | sed -n "\${n}p")
case "$outcome" in
  fail) exit 1 ;;
  stall) sleep 60 ;;
  *) exit 0 ;;
esac
`;

// sudo stand-in: only records its arguments.
const SUDO = `#!/bin/sh
echo "sudo $*" >> "$BROWSER_TEST_LOG"
exit 0
`;

function run({ deps = "ok", download = "ok" }) {
  const dir = mkdtempSync(join(tmpdir(), "browsers-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const log = join(dir, "log");
  writeFileSync(log, "");
  for (const [name, body] of [
    ["npx", NPX],
    ["sudo", SUDO],
  ]) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
  const result = spawnSync("sh", [SCRIPT], {
    encoding: "utf8",
    timeout: 60_000,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      BROWSER_TEST_DIR: dir,
      BROWSER_TEST_LOG: log,
      BROWSER_TEST_PLAN_DEPS: deps,
      BROWSER_TEST_PLAN_DOWNLOAD: download,
      PFLANZENDEX_BROWSER_SYSTEM_LIMIT: "2",
      PFLANZENDEX_BROWSER_DOWNLOAD_LIMIT: "2",
    },
  });
  const calls = readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
  rmSync(dir, { recursive: true, force: true });
  return { status: result.status, stderr: result.stderr, calls };
}

const APT = "npx --no-install playwright install-deps chromium";
const DOWNLOAD = "npx --no-install playwright install chromium";

test(
  "US-QG-01: a healthy install runs both parts once and touches no system process",
  { skip: !hasTimeout },
  () => {
    const r = run({});
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.calls, [APT, DOWNLOAD]);
  },
);

test(
  "US-QG-01: a stalled apt part is stopped after its limit, dpkg is repaired and the part runs once more",
  { skip: !hasTimeout },
  () => {
    const r = run({ deps: "stall ok" });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(
      r.calls.filter((c) => c.startsWith("npx")),
      [APT, APT, DOWNLOAD],
    );
    assert.ok(r.calls.includes("sudo pkill -KILL -x apt-get"));
    assert.ok(r.calls.includes("sudo dpkg --configure -a"));
    assert.match(
      r.stderr,
      /system packages \(apt\) failed or took longer than 2 s \(attempt 1 of 2\)/,
    );
  },
);

test(
  "US-QG-01: an apt part that stalls twice fails the job by name, and the download does not start",
  { skip: !hasTimeout },
  () => {
    const r = run({ deps: "stall stall" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /system packages \(apt\) .*\(attempt 2 of 2\)/);
    assert.equal(r.calls.filter((c) => c === DOWNLOAD).length, 0);
  },
);

test(
  "US-QG-01: a failed browser download is retried once, and a second failure fails the job",
  { skip: !hasTimeout },
  () => {
    const retried = run({ download: "fail ok" });
    assert.equal(retried.status, 0, retried.stderr);
    assert.equal(retried.calls.filter((c) => c === DOWNLOAD).length, 2);
    const failed = run({ download: "fail fail" });
    assert.notEqual(failed.status, 0);
    assert.match(
      failed.stderr,
      /Chromium download failed or took longer than 2 s \(attempt 2 of 2\)/,
    );
  },
);
