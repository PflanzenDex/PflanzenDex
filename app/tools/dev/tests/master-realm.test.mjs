// Tests for deploy/keycloak/master-realm.sh with a stubbed keycloak container (KC_EXEC), no Docker (TE-03, #758).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const script = new URL("../../../config/deploy/keycloak/master-realm.sh", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "master-realm-"));
const calls = join(dir, "calls");
// Stub: logs every command; `config credentials` fails with STUB_LOGIN=fail, `update` fails with STUB_UPDATE=fail.
const exec = join(dir, "kc-exec");
writeFileSync(
  exec,
  `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${calls}"
case "$*" in
  *"config credentials"*) [ "\${STUB_LOGIN:-}" != fail ] ;;
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

test("TE-03 a fresh installation ends with brute-force protection on in the master realm (#758)", () => {
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

test("TE-03 after the admin handover the deploy goes on and says why nothing changed (#758)", () => {
  const r = run({ STUB_LOGIN: "fail" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /bootstrap admin cannot sign in/);
  assert.doesNotMatch(r.calls, /update realms\/master/);
});

test("TE-03 a failed change fails the deploy (#758)", () => {
  const r = run({ STUB_UPDATE: "fail" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /could not turn on brute-force protection/);
});
