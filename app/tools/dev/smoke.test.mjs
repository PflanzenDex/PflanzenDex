// Tests for deploy/scripts/smoke.sh with a stubbed curl on PATH (no Docker, no network).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const smoke = new URL("../../deploy/scripts/smoke.sh", import.meta.url).pathname;
const bin = mkdtempSync(join(tmpdir(), "smoke-"));
// Stub: with -w prints STUB_CODE (web root), otherwise prints STUB_HEALTH or fails (/health).
writeFileSync(
  join(bin, "curl"),
  `#!/usr/bin/env bash
for a in "$@"; do if [ "$a" = "-w" ]; then printf '%s' "\${STUB_CODE:-200}"; exit 0; fi; done
if [ -z "\${STUB_HEALTH+x}" ]; then exit 22; fi
printf '%s' "$STUB_HEALTH"
`,
);
chmodSync(join(bin, "curl"), 0o755);

function run(env, args = ["http://x", "v0.1.0"]) {
  return spawnSync("bash", [smoke, ...args], {
    encoding: "utf8",
    env: { PATH: `${bin}:${process.env.PATH}`, SMOKE_RETRIES: "2", SMOKE_DELAY: "0", ...env },
  });
}
const health = (v) =>
  JSON.stringify({ status: "ok", product: "PflanzenDex", version: v, commit: "abc" });

test("ok when version matches and web root is 200", () => {
  const r = run({ STUB_HEALTH: health("v0.1.0") });
  assert.equal(r.status, 0, r.stderr);
});

test("fails when /health reports a different version", () => {
  const r = run({ STUB_HEALTH: health("v0.0.9") });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /expected 'v0.1.0'/);
});

test("fails when /health is unreachable", () => {
  const r = run({});
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not reachable/);
});

test("fails when the web root is not 200", () => {
  const r = run({ STUB_HEALTH: health("v0.1.0"), STUB_CODE: "502" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /HTTP 502/);
});

test("usage error without arguments", () => {
  assert.equal(run({}, []).status, 2);
});
