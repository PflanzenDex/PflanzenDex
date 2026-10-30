// Tests for deploy/scripts/backup.sh and restore.sh with stubbed Postgres containers (PG_EXEC), no Docker (TE-03, #760, #1010).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const deploy = new URL("../../../config/deploy/", import.meta.url).pathname;
const backup = join(deploy, "scripts/backup.sh");
const stubDir = mkdtempSync(join(tmpdir(), "backup-stub-"));
// Stub: pg_dump prints a fake dump, pg_restore -l reads it, psql says the sign-in database exists.
const pgExec = join(stubDir, "pg-exec");
writeFileSync(
  pgExec,
  `#!/usr/bin/env bash
case "$*" in
  *pg_dump*) printf 'PGDMP fake dump' ;;
  *pg_restore*) cat > /dev/null ;;
  *psql*) cat > /dev/null; echo 1 ;;
esac
`,
);
chmodSync(pgExec, 0o755);
// Stub for restore.sh: records the last argument of its call (the schema owner role) in $RESTORE_LOG.
const restoreExec = join(stubDir, "restore-exec");
writeFileSync(
  restoreExec,
  `#!/usr/bin/env bash
cat > /dev/null
for last; do :; done
printf '%s' "$last" > "$RESTORE_LOG"
`,
);
chmodSync(restoreExec, 0o755);

// DEPLOY_ENV_FILE is empty unless a test names a file, so the host's real .env never reaches these tests (#1010).
function run(env, script = backup) {
  return spawnSync("bash", [script], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      PG_EXEC: pgExec,
      BACKUP_REMOTE: "",
      DEPLOY_ENV_FILE: "",
      ...env,
    },
  });
}
// A copy of a deploy script in a folder of its own: a .env written next to it is the copy's, never the checkout's (#1010).
function copyScript(name) {
  const root = mkdtempSync(join(tmpdir(), "deploy-copy-"));
  mkdirSync(join(root, "scripts"));
  copyFileSync(join(deploy, "scripts", name), join(root, "scripts", name));
  return { root, script: join(root, "scripts", name) };
}
const mode = (path) => statSync(path).mode & 0o777;

test("TE-03 new dumps are readable by the owner only, in a folder only the owner can open (#760)", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "backup-")), "backups");
  const r = run({ BACKUP_DIR: dir, HOME: tmpdir() });
  assert.equal(r.status, 0, r.stderr);
  const dumps = readdirSync(dir);
  assert.deepEqual(dumps.map((f) => f.split("-")[0]).sort(), ["keycloak", "pflanzendex"]);
  for (const f of dumps) assert.equal(mode(join(dir, f)), 0o600, f);
  assert.equal(mode(dir), 0o700);
});

test("TE-03 dumps of earlier runs are tightened to 0600 on the next run (#760)", () => {
  const dir = mkdtempSync(join(tmpdir(), "backup-"));
  const old = join(dir, "keycloak-20260101T000000Z.dump");
  writeFileSync(old, "old");
  chmodSync(old, 0o664);
  chmodSync(dir, 0o775);
  assert.equal(run({ BACKUP_DIR: dir, HOME: tmpdir() }).status, 0);
  assert.equal(mode(old), 0o600);
  assert.equal(mode(dir), 0o700);
});

test("TE-03 without BACKUP_DIR the dumps go outside the repository, into the home folder (#760)", () => {
  const home = mkdtempSync(join(tmpdir(), "backup-home-"));
  const r = run({ HOME: home });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readdirSync(join(home, "pflanzendex-backups")).length, 2);
});

test("NFR-15 DEPLOY_ENV_FILE= keeps the .env of the deploy folder out of a run, so the dumps stay in BACKUP_DIR (#1010)", () => {
  const { root, script } = copyScript("backup.sh");
  const hostBackups = join(mkdtempSync(join(tmpdir(), "host-backups-")), "backups");
  mkdirSync(hostBackups);
  writeFileSync(join(root, ".env"), `BACKUP_DIR=${hostBackups}\n`);
  const dir = join(mkdtempSync(join(tmpdir(), "backup-")), "backups");
  const r = run({ BACKUP_DIR: dir, HOME: tmpdir(), DEPLOY_ENV_FILE: "" }, script);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readdirSync(dir).length, 2);
  assert.deepEqual(readdirSync(hostBackups), []);
});

test("NFR-15 without DEPLOY_ENV_FILE the .env of the deploy folder is loaded, as before (#1010)", () => {
  const { root, script } = copyScript("backup.sh");
  const dir = join(mkdtempSync(join(tmpdir(), "backup-")), "backups");
  writeFileSync(join(root, ".env"), `BACKUP_DIR=${dir}\n`);
  const r = spawnSync("bash", [script], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, PG_EXEC: pgExec, HOME: tmpdir() },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readdirSync(dir).length, 2);
});

test("NFR-15 DEPLOY_ENV_FILE names an env file anywhere, and its BACKUP_DIR is honored (#1010)", () => {
  const envFile = join(mkdtempSync(join(tmpdir(), "backup-env-")), "custom.env");
  const dir = join(mkdtempSync(join(tmpdir(), "backup-")), "backups");
  writeFileSync(envFile, `BACKUP_DIR=${dir}\n`);
  const r = run({ DEPLOY_ENV_FILE: envFile, HOME: tmpdir() });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readdirSync(dir).length, 2);
});

test("NFR-15 DEPLOY_ENV_FILE naming a missing file loads nothing, so the caller's BACKUP_DIR applies (#1010)", () => {
  const missing = join(mkdtempSync(join(tmpdir(), "backup-env-")), "missing.env");
  const dir = join(mkdtempSync(join(tmpdir(), "backup-")), "backups");
  const r = run({ DEPLOY_ENV_FILE: missing, BACKUP_DIR: dir, HOME: tmpdir() });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readdirSync(dir).length, 2);
});

// Runs restore.sh on a copy of the deploy scripts whose .env sets the owner role; returns the role it was called with.
function restoreOwnerRole(env) {
  const { root, script } = copyScript("restore.sh");
  writeFileSync(join(root, ".env"), "DB_OWNER_USER=from-host-env\n");
  const dump = join(root, "app.dump");
  writeFileSync(dump, "PGDMP fake dump");
  const log = join(root, "owner.log");
  const r = spawnSync("bash", [script, dump, "pdx_check"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, PG_EXEC: restoreExec, RESTORE_LOG: log, ...env },
  });
  assert.equal(r.status, 0, r.stderr);
  return readFileSync(log, "utf8");
}

test("NFR-15 restore.sh with DEPLOY_ENV_FILE= ignores the .env of the deploy folder (#1010)", () => {
  assert.equal(restoreOwnerRole({ DEPLOY_ENV_FILE: "" }), "pflanzendex_owner");
});

test("NFR-15 restore.sh without DEPLOY_ENV_FILE loads the .env of the deploy folder, as before (#1010)", () => {
  assert.equal(restoreOwnerRole({}), "from-host-env");
});

test("TE-03 git ignores the old backup folder and any dump (#760)", () => {
  const paths = ["app/config/deploy/backups/pflanzendex-x.dump", "keycloak-x.dump"];
  const r = spawnSync("git", ["check-ignore", "--no-index", ...paths], {
    cwd: join(deploy, "../../.."),
    encoding: "utf8",
  });
  assert.deepEqual(r.stdout.trim().split("\n"), paths);
});
