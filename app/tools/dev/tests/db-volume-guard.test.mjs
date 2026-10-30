// Tests for check_db_volume in deploy/scripts/deploy.sh with a stubbed docker and compose, no Docker (US-DEV-07, P-10).
// The check runs its real shell code against directories that stand for the data volume.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

const deploy = new URL("../../../config/deploy/scripts/deploy.sh", import.meta.url).pathname;
const bin = mkdtempSync(join(tmpdir(), "db-volume-bin-"));
// Stub docker: `volume inspect NAME` logs NAME and succeeds with STUB_VOLUME=present; `run` executes the check's shell
// script with /v replaced by STUB_VOLUME_DIR (the fake volume), or fails with STUB_RUN=fail (daemon not reachable).
writeFileSync(
  join(bin, "docker"),
  `#!/usr/bin/env bash
case "$1" in
  volume) echo "$3" >> "$STUB_LOG"; [ "\${STUB_VOLUME:-}" = present ] ;;
  run) [ "\${STUB_RUN:-}" != fail ] || exit 1; script="\${@: -1}"; exec sh -c "\${script//\\/v\\//$STUB_VOLUME_DIR/}" ;;
esac
`,
);
chmodSync(join(bin, "docker"), 0o755);
// Stub compose: `config --images` lists the image of the database service of the checked-out compose file.
writeFileSync(
  join(bin, "compose"),
  `#!/usr/bin/env bash
printf 'caddy:2-alpine\\npostgres:%s-alpine\\n' "$STUB_MAJOR"
`,
);
chmodSync(join(bin, "compose"), 0o755);

// files: the fake volume's content, relative paths (a trailing "/" makes an empty folder).
function run({ major = "18", volume = "present", files = {}, env = {}, runFail = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "db-volume-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    if (!path.endsWith("/")) writeFileSync(join(dir, path), text);
  }
  const log = join(dir, "..", `calls-${process.hrtime.bigint()}`);
  writeFileSync(log, "");
  // Only the function is taken from the script, so the test runs the real code without running `main`.
  const script = `set -u; source <(sed -n '/^check_db_volume() {/,/^}/p' "$DEPLOY"); compose=("$STUB_COMPOSE"); check_db_volume`;
  const r = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      DEPLOY: deploy,
      STUB_COMPOSE: join(bin, "compose"),
      STUB_MAJOR: major,
      STUB_VOLUME: volume,
      STUB_VOLUME_DIR: dir,
      STUB_LOG: log,
      STUB_RUN: runFail ? "fail" : "",
      ...env,
    },
  });
  return { ...r, volumes: readFileSync(log, "utf8").trim().split("\n").filter(Boolean) };
}

test("US-DEV-07 a new host without a volume starts with any PostgreSQL image", () => {
  const r = run({ volume: "absent", major: "18" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.volumes, ["pflanzendex_dbdata"]);
});

test("US-DEV-07 an empty volume starts with 16 and with 18", () => {
  for (const major of ["16", "18"]) assert.equal(run({ major }).status, 0, major);
});

test("US-DEV-07 PostgreSQL 16 data at the root of the volume starts with the 16 image", () => {
  const r = run({ major: "16", files: { PG_VERSION: "16\n", "base/1/1259": "" } });
  assert.equal(r.status, 0, r.stderr);
});

test("US-DEV-07 PostgreSQL 16 data is refused by the 18 image before anything starts (P-10)", () => {
  const r = run({ major: "18", files: { PG_VERSION: "16\n" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /holds old 16 data, but this deploy starts postgres:18/);
  assert.match(r.stderr, /Nothing was started/);
  assert.match(r.stderr, /docs\/guides\/operations\/postgres-major-upgrade\.md/);
});

test("US-DEV-07 an aborted 18 start leaves an empty 18 folder: the 16 data still refuses 18", () => {
  const r = run({ major: "18", files: { PG_VERSION: "16\n", "18/docker/": "" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /holds old 16 data/);
});

test("US-DEV-07 PostgreSQL 18 data starts with the 18 image", () => {
  const r = run({ major: "18", files: { "18/docker/PG_VERSION": "18\n" } });
  assert.equal(r.status, 0, r.stderr);
});

test("US-DEV-07 PostgreSQL 18 data is refused by the 16 image, so a rollback never starts an empty cluster (P-10)", () => {
  const r = run({ major: "16", files: { "18/docker/PG_VERSION": "18\n" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /holds new 18 data, but this deploy starts postgres:16/);
});

test("US-DEV-07 a data folder of another 18 minor major is refused", () => {
  const r = run({ major: "18", files: { "18/docker/PG_VERSION": "17\n" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /holds new 17 data/);
});

test("US-DEV-07 an unreadable volume stops the deploy with a message, nothing is assumed (P-10)", () => {
  const r = run({ runFail: true });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read the database volume pflanzendex_dbdata/);
});

test("US-DEV-07 the volume name follows the compose project name", () => {
  const r = run({ env: { COMPOSE_PROJECT_NAME: "pdx-check" }, files: { PG_VERSION: "16\n" } });
  assert.deepEqual(r.volumes, ["pdx-check_dbdata"]);
});
