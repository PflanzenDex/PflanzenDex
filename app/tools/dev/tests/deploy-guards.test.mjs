// Tests for the guards of deploy/scripts/deploy.sh with a stubbed docker and compose, no Docker: check_db_volume (US-DEV-07,
// P-10) and refresh_keycloak_theme (US-DEV-06, #2161). Each check runs its real shell code against folders that stand for
// the data volume or the theme tree.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

const deploy = new URL("../../../config/deploy/scripts/deploy.sh", import.meta.url).pathname;
const bin = tempDir("db-volume-bin-");
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
  const dir = tempDir("db-volume-");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    if (!path.endsWith("/")) writeFileSync(join(dir, path), text);
  }
  const log = join(tempDir("db-volume-calls-"), "calls");
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

test("US-DEV-07 an image pinned to an exact version and a digest still names its major (#761)", () => {
  // The stub lists `postgres:18.6-alpine`; the compose file has `postgres:18.6-alpine3.24@sha256:…`.
  const major = "18.6";
  assert.equal(run({ major, files: { "18/docker/PG_VERSION": "18\n" } }).status, 0);
  const r = run({ major, files: { PG_VERSION: "16\n" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /holds old 16 data, but this deploy starts postgres:18 /);
});

// refresh_keycloak_theme (US-DEV-06, #2161). The checkout's theme tree is <root>/dev/keycloak-theme; the function runs in
// <root>/deploy, where deploy.sh cd's, and searches ../dev/keycloak-theme from there.
const themeBin = tempDir("keycloak-theme-bin-");
// Stub docker: `inspect` prints STUB_STARTED (the StartedAt of the container) or fails with STUB_INSPECT=fail.
writeFileSync(
  join(themeBin, "docker"),
  `#!/usr/bin/env bash
echo "docker $*" >> "$STUB_LOG"
[ "\${STUB_INSPECT:-}" != fail ] || { echo "Error: no such object" >&2; exit 1; }
printf '%s\\n' "$STUB_STARTED"
`,
);
chmodSync(join(themeBin, "docker"), 0o755);
// Stub compose: `ps -q keycloak` prints STUB_CONTAINER (empty: no container) or fails with STUB_PS=fail; `up` (the
// recreate) fails with STUB_RECREATE=fail. Every call is logged.
writeFileSync(
  join(themeBin, "compose"),
  `#!/usr/bin/env bash
echo "compose $*" >> "$STUB_LOG"
case "$1" in
  ps) [ "\${STUB_PS:-}" != fail ] || { echo "Error: compose ps failed" >&2; exit 1; }; [ -z "\${STUB_CONTAINER:-}" ] || echo "$STUB_CONTAINER" ;;
  up) [ "\${STUB_RECREATE:-}" != fail ] || { echo "Error: up failed" >&2; exit 1; } ;;
esac
`,
);
chmodSync(join(themeBin, "compose"), 0o755);

const KEYCLOAK_START = "2026-11-15T08:00:00Z";
const OLD = new Date("2026-11-01T00:00:00Z");
// Every entry of the theme tree gets the old time, so only the entries a test names are newer than the start.
function setOld(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) setOld(path);
    utimesSync(path, OLD, OLD);
  }
  utimesSync(dir, OLD, OLD);
}

// changed: theme path → time its file was written (an existing file); removed: theme path → time its file was removed,
// which changes its folder at that time. fail: "inspect", "ps" or "recreate", the call that fails.
function refresh({
  started = KEYCLOAK_START,
  container = "kc-1",
  changed = {},
  removed = {},
  fail = "",
} = {}) {
  const root = tempDir("keycloak-theme-");
  const theme = join(root, "dev", "keycloak-theme");
  const login = join(theme, "pflanzendex", "login");
  mkdirSync(join(login, "resources", "css"), { recursive: true });
  writeFileSync(join(login, "template.ftl"), "");
  writeFileSync(join(login, "resources", "css", "pflanzendex.css"), "");
  mkdirSync(join(root, "deploy"));
  setOld(theme);
  for (const [path, when] of Object.entries(changed)) {
    writeFileSync(join(theme, path), "changed");
    utimesSync(join(theme, path), new Date(when), new Date(when));
  }
  for (const [path, when] of Object.entries(removed)) {
    unlinkSync(join(theme, path));
    utimesSync(join(theme, dirname(path)), new Date(when), new Date(when));
  }
  const log = join(tempDir("keycloak-theme-calls-"), "calls");
  writeFileSync(log, "");
  // Only the function is taken from the script; the call runs under the shell options of deploy.sh. TZ is Berlin, so a
  // StartedAt read as local time would show.
  const script = `set -euo pipefail; source <(sed -n '/^refresh_keycloak_theme() {/,/^}/p' "$DEPLOY"); compose=("$STUB_COMPOSE"); refresh_keycloak_theme`;
  const r = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    cwd: join(root, "deploy"),
    env: {
      PATH: `${themeBin}:${process.env.PATH}`,
      TZ: "Europe/Berlin",
      DEPLOY: deploy,
      STUB_COMPOSE: join(themeBin, "compose"),
      STUB_LOG: log,
      STUB_STARTED: started,
      STUB_CONTAINER: container,
      STUB_INSPECT: fail === "inspect" ? "fail" : "",
      STUB_PS: fail === "ps" ? "fail" : "",
      STUB_RECREATE: fail === "recreate" ? "fail" : "",
    },
  });
  return { ...r, calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean) };
}
const CSS = "pflanzendex/login/resources/css/pflanzendex.css";
const TEMPLATE = "pflanzendex/login/template.ftl";
// The recreate: a new container drops the gzip cache and the resources version of the old one (#2161, measured).
const RECREATE = "compose up -d --no-deps --force-recreate keycloak";

test("US-DEV-06 a theme file written after keycloak started recreates keycloak, and the log line names the file (#2161)", () => {
  const r = refresh({ changed: { [CSS]: "2026-11-15T08:30:00Z" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(
    r.stdout,
    /keycloak theme changed since keycloak started \(\S*pflanzendex\.css\); recreating keycloak \(its gzip cache/,
  );
  assert.ok(r.calls.includes(RECREATE), r.calls.join("\n"));
});

test("US-DEV-06 a theme tree older than the start of keycloak leaves keycloak running (#2161)", () => {
  const r = refresh();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "");
  assert.ok(!r.calls.some((c) => c.startsWith("compose up")), r.calls.join("\n"));
});

test("US-DEV-06 no keycloak container yet (a first deploy) returns 0 without a recreate (#2161)", () => {
  const r = refresh({ container: "", changed: { [TEMPLATE]: "2026-11-15T08:30:00Z" } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.calls, ["compose ps -q keycloak"]);
});

test("US-DEV-06 a failing docker inspect is an error, not an unchanged theme (P-10, #2161)", () => {
  const r = refresh({ fail: "inspect", changed: { [TEMPLATE]: "2026-11-15T08:30:00Z" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ERROR: docker inspect of keycloak failed/);
  assert.ok(!r.calls.some((c) => c.includes("up -d")), r.calls.join("\n"));
});

test("US-DEV-06 a failing compose ps is an error, not a missing container (P-10, #2161)", () => {
  const r = refresh({ fail: "ps", changed: { [TEMPLATE]: "2026-11-15T08:30:00Z" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ERROR: .* ps -q keycloak failed/);
  assert.deepEqual(r.calls, ["compose ps -q keycloak"]);
});

test("US-DEV-06 a failing recreate of keycloak fails the deploy with a message (#2161)", () => {
  const r = refresh({ fail: "recreate", changed: { [CSS]: "2026-11-15T08:30:00Z" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /recreating keycloak failed; logs: .* logs keycloak/);
});

test("US-DEV-06 a theme file written a fraction of a second after the start recreates keycloak (#2161)", () => {
  const r = refresh({
    started: "2026-11-15T08:00:00.123456789Z",
    changed: { [TEMPLATE]: "2026-11-15T08:00:00.400Z" },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.calls.includes(RECREATE), r.calls.join("\n"));
});

test("US-DEV-06 a theme file removed after the start recreates keycloak, and the log line names its folder (#2161)", () => {
  const r = refresh({ removed: { [CSS]: "2026-11-15T08:30:00Z" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(
    r.stdout,
    /keycloak theme changed since keycloak started \(\S*\/css\); recreating keycloak/,
  );
  assert.ok(r.calls.includes(RECREATE), r.calls.join("\n"));
});

test("US-DEV-06 the start time counts as UTC: a change at 07:30 UTC is before a start at 08:00Z (#2161)", () => {
  const r = refresh({ changed: { [TEMPLATE]: "2026-11-15T07:30:00Z" } });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.calls.some((c) => c.startsWith("compose up")), r.calls.join("\n"));
});
