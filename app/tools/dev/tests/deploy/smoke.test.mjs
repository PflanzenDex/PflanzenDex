// Tests for deploy/scripts/smoke.sh with a stubbed curl on PATH (no Docker, no network).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const smoke = new URL("../../../../config/deploy/scripts/smoke.sh", import.meta.url).pathname;
const bin = mkdtempSync(join(tmpdir(), "smoke-"));
// Stub: with -w prints STUB_CODE (web root); for /health/details prints STUB_DETAILS, otherwise STUB_PUBLIC
// (default: the status only); an unset STUB_DETAILS or STUB_PUBLIC="fail" fails like an unreachable route.
writeFileSync(
  join(bin, "curl"),
  `#!/usr/bin/env bash
for a in "$@"; do if [ "$a" = "-w" ]; then printf '%s' "\${STUB_CODE:-200}"; exit 0; fi; done
for a in "$@"; do case "$a" in */health/details)
  if [ -z "\${STUB_DETAILS+x}" ]; then exit 22; fi
  printf '%s' "$STUB_DETAILS"; exit 0 ;;
esac; done
if [ "\${STUB_PUBLIC:-}" = "fail" ]; then exit 22; fi
status='{"status":"ok"}'
printf '%s' "\${STUB_PUBLIC:-$status}"
`,
);
chmodSync(join(bin, "curl"), 0o755);

function run(env, args = ["http://x", "v0.1.0"]) {
  return spawnSync("bash", [smoke, ...args], {
    encoding: "utf8",
    env: { PATH: `${bin}:${process.env.PATH}`, SMOKE_RETRIES: "2", SMOKE_DELAY: "0", ...env },
  });
}
const details = (v) =>
  JSON.stringify({ status: "ok", product: "PflanzenDex", version: v, commit: "abc" });

test("ok when version matches and web root is 200", () => {
  const r = run({ STUB_DETAILS: details("v0.1.0") });
  assert.equal(r.status, 0, r.stderr);
});

test("fails when /health/details reports a different version", () => {
  const r = run({ STUB_DETAILS: details("v0.0.9") });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /expected 'v0.1.0'/);
});

test("fails when /health is unreachable", () => {
  const r = run({ STUB_PUBLIC: "fail", STUB_DETAILS: details("v0.1.0") });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\/health not reachable/);
});

test("TE-03 fails when the public /health shows the version (#759)", () => {
  const r = run({ STUB_PUBLIC: details("v0.1.0"), STUB_DETAILS: details("v0.1.0") });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /more than the status/);
});

test("fails when /health/details is not readable", () => {
  const r = run({});
  assert.equal(r.status, 1);
  assert.match(r.stderr, /details not readable/);
});

test("TE-03 reads the details through SMOKE_DETAILS_CMD when set (inside the stack, #759)", () => {
  const cmd = `printf '%s' '${details("v0.1.0")}'`;
  assert.equal(run({ SMOKE_DETAILS_CMD: cmd }).status, 0);
  assert.equal(run({ SMOKE_DETAILS_CMD: "exit 1", STUB_DETAILS: details("v0.1.0") }).status, 1);
});

test("fails when the web root is not 200", () => {
  const r = run({ STUB_DETAILS: details("v0.1.0"), STUB_CODE: "502" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /HTTP 502/);
});

test("usage error without arguments", () => {
  assert.equal(run({}, []).status, 2);
});
