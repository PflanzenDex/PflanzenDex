// Tests for deploy/scripts/backup.sh with a stubbed Postgres container (PG_EXEC), no Docker (TE-03, #760).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const deploy = new URL("../../../../config/deploy/", import.meta.url).pathname;
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

function run(env) {
  return spawnSync("bash", [backup], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, PG_EXEC: pgExec, BACKUP_REMOTE: "", ...env },
  });
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

test("TE-03 git ignores the old backup folder and any dump (#760)", () => {
  const paths = ["app/config/deploy/backups/pflanzendex-x.dump", "keycloak-x.dump"];
  const r = spawnSync("git", ["check-ignore", "--no-index", ...paths], {
    cwd: join(deploy, "../../.."),
    encoding: "utf8",
  });
  assert.deepEqual(r.stdout.trim().split("\n"), paths);
});
