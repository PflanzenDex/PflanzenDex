// Tests for deploy/keycloak/master-realm.sh with a stubbed keycloak container (KC_EXEC), no Docker (TE-03, #758, #1461).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, after } from "node:test";

// Folders this file makes are removed after it, also when a test fails (#1278).
const madeDirs = [];
after(() => {
  for (const dir of madeDirs) rmSync(dir, { recursive: true, force: true });
});
function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  madeDirs.push(dir);
  return dir;
}

// The real outputs of Keycloak 26.8.1 (the image of docker-compose.yml), measured on 2026-11-06 in a throwaway compose
// project (US-DEV-06, #1461). kcadm.sh writes all of them to stderr and exits 1; the first line is printed in every case.
const LOGGED_IN_LINE = "Logging into http://localhost:8080 as user admin of realm master";
const KCADM = {
  // A wrong password, the bootstrap admin deleted by the handover, and a locked-out admin all get this answer.
  rejected: `${LOGGED_IN_LINE}\nInvalid user credentials [invalid_grant]`,
  // The HTTP port is not open yet.
  refused: `${LOGGED_IN_LINE}\nFailed to send request - Connect to localhost:8080 [localhost/127.0.0.1, localhost/0:0:0:0:0:0:0:1] failed: Connection refused`,
  // The port is open, the realm import is still running.
  importing: `${LOGGED_IN_LINE}\n503 Service Unavailable`,
};
// `docker compose exec` (not kcadm) reports a stopped container with this text.
const STOPPED = 'service "keycloak" is not running';

const script = new URL("../../../config/deploy/keycloak/master-realm.sh", import.meta.url).pathname;
const dir = tempDir("master-realm-");
const calls = join(dir, "calls");
// Stub: logs every command. STUB_DOWN: every exec fails with that text (stopped container). STUB_LOGIN: the sign-in
// fails with that text on stderr, exit 1. STUB_UPDATE=fail: the update fails.
const exec = join(dir, "kc-exec");
writeFileSync(
  exec,
  `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${calls}"
[ -z "\${STUB_DOWN:-}" ] || { printf '%s\\n' "$STUB_DOWN" >&2; exit 1; }
case "$*" in
  *"config credentials"*) [ -z "\${STUB_LOGIN:-}" ] || { printf '%s\\n' "$STUB_LOGIN" >&2; exit 1; } ;;
  *"update realms/master"*) [ "\${STUB_UPDATE:-}" != fail ] ;;
esac
`,
);
chmodSync(exec, 0o755);

function run(env = {}) {
  writeFileSync(calls, "");
  const r = spawnSync("bash", [script], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, KC_EXEC: exec, ...env },
  });
  return { ...r, calls: readFileSync(calls, "utf8") };
}

// A sign-in that failed for another reason than the handover: exit 1, the cause named, nothing changed.
function assertFailsLoudly(r, cause) {
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /^ERROR: master realm: the sign-in as the bootstrap admin failed: /m);
  assert.ok(r.stderr.includes(cause), `the cause "${cause}" is named:\n${r.stderr}`);
  assert.match(r.stderr, /Brute-force protection is NOT set/);
  assert.doesNotMatch(r.stdout, /handed over/, "the handover message is not shown");
  assert.doesNotMatch(r.calls, /update realms\/master/, "no change was attempted");
}

test("US-DEV-06 TE-03 a fresh installation ends with brute-force protection on in the master realm, exit 0 (#758)", () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.calls, /config credentials .*--realm master/);
  assert.match(r.calls, /update realms\/master .*-s bruteForceProtected=true -s failureFactor=5/);
  assert.match(r.stdout, /brute-force protection on/);
});

test("TE-03 signs in with the container's own bootstrap credentials, no password on the host (#758)", () => {
  const r = run();
  assert.match(
    r.calls,
    /--user "\$KC_BOOTSTRAP_ADMIN_USERNAME" --password "\$KC_BOOTSTRAP_ADMIN_PASSWORD"/,
  );
  assert.match(r.calls, /rm -f \/tmp\/kcadm-master-realm\.config/);
});

test("US-DEV-06 TE-03 rejected credentials after the admin handover: exit 0 with the handover message, no update (#758, #1461)", () => {
  const r = run({ STUB_LOGIN: KCADM.rejected });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    r.stdout,
    "master realm: the bootstrap admin cannot sign in (handed over to a named admin?); brute-force protection stays with that admin (runbook)\n",
  );
  assert.equal(r.stderr, "");
  assert.doesNotMatch(r.calls, /update realms\/master/);
});

test("US-DEV-06 TE-03 Keycloak not listening yet (connection refused): exit 1, the cause named, no update (#1461)", () => {
  assertFailsLoudly(run({ STUB_LOGIN: KCADM.refused }), "failed: Connection refused");
});

test("US-DEV-06 TE-03 Keycloak still importing the realm (503): exit 1, the cause named, no update (#1461)", () => {
  assertFailsLoudly(run({ STUB_LOGIN: KCADM.importing }), "503 Service Unavailable");
});

test("US-DEV-06 TE-03 a stopped keycloak container: exit 1, the cause named, no update (#1461)", () => {
  assertFailsLoudly(run({ STUB_DOWN: STOPPED }), STOPPED);
});

test("TE-03 a failed change fails the deploy (#758)", () => {
  const r = run({ STUB_UPDATE: "fail" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /could not turn on brute-force protection/);
});
