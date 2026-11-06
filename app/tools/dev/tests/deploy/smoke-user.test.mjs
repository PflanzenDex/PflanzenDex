// Tests for keycloak/smoke-user.sh (US-DEV-06, #1404) with a fake Keycloak admin CLI and fake containers (KC_EXEC, DB_EXEC),
// no Docker and no network. The fake CLI keeps one user in a state folder and logs the commands it gets.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
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

const script = new URL("../../../../config/deploy/keycloak/smoke-user.sh", import.meta.url)
  .pathname;
const SUBJECT = "11111111-2222-4333-8444-555555555555";

// The fake admin CLI: `config credentials` accepts the bootstrap password only; the user lives in $FAKE_KC_STATE.
function userHarness() {
  const root = tempDir("smoke-user-");
  const state = join(root, "state");
  const bin = join(root, "bin");
  const h = {
    root,
    state,
    kcLog: join(root, "kc.log"),
    hostArgv: join(root, "host-argv.log"),
    dbLog: join(root, "db.log"),
    kcadm: join(bin, "kcadm.sh"),
    kcExec: join(bin, "kc-exec"),
    dbExec: join(bin, "db-exec"),
    password: join(state, "password"),
  };
  mkdirSync(state, { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    h.kcadm,
    `#!/usr/bin/env bash
echo "$1" >> "$FAKE_KC_LOG"
case "$1" in
  config)
    [ "$KC_BOOTSTRAP_ADMIN_PASSWORD" = "bootstrap-pass" ] || exit 1 ;;
  get)
    user=""
    for a in "$@"; do case "$a" in username=*) user="\${a#username=}" ;; esac; done
    if [ -f "$FAKE_KC_STATE/user" ] && [ "$(cat "$FAKE_KC_STATE/user")" = "$user" ]; then
      printf '[ {\\n  "id" : "%s"\\n} ]\\n' "${SUBJECT}"
    else
      printf '[ ]\\n'
    fi ;;
  create)
    prev=""
    for a in "$@"; do
      if [ "$prev" = "-s" ]; then case "$a" in username=*) echo "\${a#username=}" > "$FAKE_KC_STATE/user" ;; esac; fi
      prev="$a"
    done
    echo "Created new user with id '${SUBJECT}'" ;;
  set-password)
    prev=""
    for a in "$@"; do if [ "$prev" = "--new-password" ]; then printf '%s' "$a" > "$FAKE_KC_STATE/password"; fi; prev="$a"; done ;;
esac
exit 0
`,
  );
  // Stands in for \`docker compose exec -T keycloak\`: records its own arguments (the host side), then runs the script
  // in sh with the fake CLI in place of the container's path.
  writeFileSync(
    h.kcExec,
    `#!/usr/bin/env bash
printf '%s\\n' "$@" >> "$FAKE_HOST_ARGV"
for last; do :; done
exec sh -c "$(printf '%s' "$last" | sed "s#/opt/keycloak/bin/kcadm.sh#$FAKE_KCADM#g")"
`,
  );
  // Stands in for \`docker compose exec -T db\`: records the arguments and the SQL on stdin; fails when FAKE_DB_FAIL is set.
  writeFileSync(
    h.dbExec,
    `#!/usr/bin/env bash
printf '%s\\n' "$@" >> "$FAKE_DB_LOG"
cat >> "$FAKE_DB_LOG"
[ -z "\${FAKE_DB_FAIL:-}" ]
`,
  );
  for (const file of [h.kcadm, h.kcExec, h.dbExec]) chmodSync(file, 0o755);
  h.env = {
    SMOKE_USER: "smoke-tester",
    KC_EXEC: h.kcExec,
    DB_EXEC: h.dbExec,
    KC_BOOTSTRAP_ADMIN_USERNAME: "admin",
    KC_BOOTSTRAP_ADMIN_PASSWORD: "bootstrap-pass",
    FAKE_KCADM: h.kcadm,
    FAKE_KC_STATE: state,
    FAKE_KC_LOG: h.kcLog,
    FAKE_HOST_ARGV: h.hostArgv,
    FAKE_DB_LOG: h.dbLog,
  };
  return h;
}
function runUser(h, extra = {}, args = []) {
  return spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...h.env, ...extra },
  });
}

const countCalls = (file, name) =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line === name).length;

test("US-DEV-06 smoke-user creates the tester once, leaves an existing tester alone and sets a new password only on request", () => {
  const h = userHarness();
  const first = runUser(h);
  assert.equal(first.status, 0, first.stderr + first.stdout);
  assert.match(first.stdout, /^SMOKE_USER=smoke-tester$/m);
  const pw1 = first.stdout.match(/^SMOKE_PASSWORD=([0-9a-f]{48})$/m)?.[1];
  assert.ok(pw1, "one line with a 48 character hex password");
  assert.equal(readFileSync(h.password, "utf8"), pw1, "the user has the printed password");
  assert.equal(countCalls(h.kcLog, "set-password"), 1);
  // The app account row for the subject, written once more on every run (a no-op when it exists).
  const db = readFileSync(h.dbLog, "utf8");
  assert.ok(db.includes(`sub=${SUBJECT}`), "the account row is written for the subject");
  assert.match(db, /on conflict \(subject\) do nothing/);

  const second = runUser(h);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /smoke-user: smoke-tester exists/);
  assert.doesNotMatch(
    second.stdout,
    /SMOKE_PASSWORD=/,
    "an existing tester's password is not shown",
  );
  assert.equal(readFileSync(h.password, "utf8"), pw1, "the password is unchanged");
  assert.equal(countCalls(h.kcLog, "set-password"), 1, "no password was set again");

  const rotated = runUser(h, {}, ["--rotate-password"]);
  assert.equal(rotated.status, 0, rotated.stderr);
  const pw2 = rotated.stdout.match(/^SMOKE_PASSWORD=([0-9a-f]{48})$/m)?.[1];
  assert.ok(pw2 && pw2 !== pw1, "a new password is printed");
  assert.equal(readFileSync(h.password, "utf8"), pw2);
});

test("US-DEV-06 the password reaches the container on stdin, never on the host command line", () => {
  const h = userHarness();
  const first = runUser(h);
  assert.equal(first.status, 0, first.stderr);
  const pw = first.stdout.match(/^SMOKE_PASSWORD=([0-9a-f]{48})$/m)?.[1];
  assert.ok(pw);
  assert.ok(!readFileSync(h.hostArgv, "utf8").includes(pw), "the keycloak exec saw the password");
  assert.ok(!readFileSync(h.dbLog, "utf8").includes(pw), "the database exec saw the password");
});

test("US-DEV-06 smoke-user refuses when the bootstrap admin cannot sign in and creates nothing (#1404)", () => {
  const h = userHarness();
  const r = runUser(h, { KC_BOOTSTRAP_ADMIN_PASSWORD: "wrong" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /FAILED \(ERROR login\)/);
  assert.equal(existsSync(join(h.state, "user")), false, "no user was created");
  assert.equal(existsSync(h.dbLog), false, "the database was not touched");
});

test("TE-03 smoke-user names a realm import that is still running as a cause of a failed sign-in to the master realm (#1002)", () => {
  const h = userHarness();
  const r = runUser(h, { KC_BOOTSTRAP_ADMIN_PASSWORD: "wrong" });
  assert.equal(r.status, 1);
  // During the import of a first start every realm URL answers 503, so the sign-in to master fails the same way.
  assert.match(r.stderr, /may still be importing the realm \(every realm URL answers 503/);
  assert.match(r.stderr, /wait a minute and run again/);
});

test("US-DEV-06 a failed account write after the user was created keeps the printed password and says to run again (#1404)", () => {
  const h = userHarness();
  const r = runUser(h, { FAKE_DB_FAIL: "1" });
  assert.equal(r.status, 1);
  // The lines are printed before the database step, so a failed write does not lose the only copy of the password.
  assert.match(r.stdout, /^SMOKE_PASSWORD=[0-9a-f]{48}$/m);
  assert.match(r.stderr, /run the script again \(the Keycloak user is kept\)/);
});

test("US-DEV-06 smoke-user rejects an unknown argument and a tester name with capitals (#1404)", () => {
  const h = userHarness();
  assert.equal(runUser(h, {}, ["--force"]).status, 2);
  assert.equal(runUser(h, { SMOKE_USER: "Smoke-Tester" }).status, 2);
  assert.equal(existsSync(join(h.state, "user")), false);
});
