// The host script deploy.apply-env.sh (US-DEV-06, TE-19, #1013), run with bash against a temporary deploy folder:
// allowlist, refusals without change, backup, other lines kept, mode 600, idempotence, no value in the output, and
// that `set -a; . ./.env` and docker compose read the written values the same way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../../../../config/deploy/scripts/deploy.apply-env.sh", import.meta.url),
);
const repoExample = fileURLToPath(
  new URL("../../../../config/deploy/.env.example", import.meta.url),
);

const EXAMPLE = [
  "# template",
  "# init-only: POSTGRES_PASSWORD KEYCLOAK_ADMIN_PASSWORD",
  "#KEYCLOAK_ADMIN_PASSWORD=",
  "DB_OWNER_PASSWORD=PUT_A_LONG_RANDOM_PASSWORD_HERE",
  "POSTGRES_PASSWORD=PUT_A_LONG_RANDOM_PASSWORD_HERE",
  "#DB_OWNER_USER=pflanzendex_owner",
  "FEATURES=",
  "#SMTP_PASSWORD=",
  "MAIL_UI_HASH='PUT_A_BCRYPT_HASH_HERE'",
  "# host-only: BACKUP_DIR",
  "BACKUP_DIR=${HOME}/backups",
  "",
].join("\n");

const HOST_ENV = [
  "# host comment",
  "POSTGRES_PASSWORD=oldpassword",
  "FEATURES=",
  "BACKUP_DIR=/srv/backups # kept",
  "LOCAL_ONLY=1",
  "",
].join("\n");

function setup({ env = HOST_ENV, example = EXAMPLE } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "apply-env-"));
  writeFileSync(join(dir, "example"), example);
  if (env !== null) {
    writeFileSync(join(dir, ".env"), env);
    chmodSync(join(dir, ".env"), 0o644);
  }
  return dir;
}

const run = (dir, input, env = {}) =>
  spawnSync("bash", [script, dir, join(dir, "example")], {
    input,
    encoding: "utf8",
    env: { ...process.env, ALLOW_PASSWORD_ROTATION: "", ...env },
  });
const envOf = (dir) => readFileSync(join(dir, ".env"), "utf8");
const backups = (dir) => readdirSync(dir).filter((f) => f.startsWith(".env.bak-"));

test("US-DEV-06: allowlisted keys are set or replaced, other lines and comments stay, mode 600, backup", () => {
  const dir = setup();
  const r = run(
    dir,
    "POSTGRES_PASSWORD=n3wpass\nFEATURES=social,ai\nSMTP_PASSWORD=pa ss$word#1\n",
    {
      ALLOW_PASSWORD_ROTATION: "1",
    },
  );
  assert.equal(r.status, 0, r.stderr);
  const env = envOf(dir);
  assert.match(env, /^# host comment$/m);
  assert.match(env, /^POSTGRES_PASSWORD=n3wpass$/m);
  assert.match(env, /^FEATURES=social,ai$/m);
  assert.match(env, /^SMTP_PASSWORD='pa ss\$word#1'$/m);
  assert.match(env, /^BACKUP_DIR=\/srv\/backups # kept$/m);
  assert.match(env, /^LOCAL_ONLY=1$/m);
  assert.doesNotMatch(env, /oldpassword/);
  assert.equal(statSync(join(dir, ".env")).mode & 0o777, 0o600);
  const [b] = backups(dir);
  assert.match(b, /^\.env\.bak-\d{8}T\d{6}Z$/);
  assert.equal(readFileSync(join(dir, b), "utf8"), HOST_ENV);
  assert.equal(statSync(join(dir, b)).mode & 0o777, 0o600);
  assert.match(r.stdout, /POSTGRES_PASSWORD changed/);
  assert.match(r.stdout, /FEATURES changed/);
  assert.match(r.stdout, /SMTP_PASSWORD added/);
});

test("US-DEV-06: values never appear in stdout or stderr", () => {
  const dir = setup();
  const r = run(dir, "POSTGRES_PASSWORD=Sup3rS3cretValue\nSMTP_PASSWORD=An0therS3cret\n", {
    ALLOW_PASSWORD_ROTATION: "1",
  });
  assert.equal(r.status, 0, r.stderr);
  for (const v of ["Sup3rS3cretValue", "An0therS3cret", "oldpassword"]) {
    assert.ok(!r.stdout.includes(v), v);
    assert.ok(!r.stderr.includes(v), v);
  }
});

test("US-DEV-06: a second run with the same values is unchanged and writes no backup", () => {
  const dir = setup();
  const input = "POSTGRES_PASSWORD=oldpassword\nSMTP_PASSWORD=with space\n";
  assert.equal(run(dir, input).status, 0);
  const first = envOf(dir);
  const r = run(dir, input);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /POSTGRES_PASSWORD unchanged/);
  assert.match(r.stdout, /SMTP_PASSWORD unchanged/);
  assert.match(r.stdout, /nothing changed/);
  assert.equal(envOf(dir), first);
  assert.equal(backups(dir).length, 1);
});

test("US-DEV-06: refused input leaves .env and its backups untouched", () => {
  const cases = [
    ["unknown key", "NOT_IN_TEMPLATE=x\n", /not on the allowlist/],
    ["host-only key", "BACKUP_DIR=/elsewhere\n", /not on the allowlist/],
    ["bad key format", "lower=x\n", /not of the form/],
    ["duplicate", "FEATURES=a\nFEATURES=b\n", /given twice/],
    ["empty value", "FEATURES=\n", /empty value/],
    ["carriage return", "FEATURES=a\rb\n", /control character/],
    ["tab", "FEATURES=a\tb\n", /control character/],
    ["quote", "FEATURES=it's\n", /quote/],
    ["backslash", "FEATURES=a\\b\n", /backslash/],
    ["NUL byte", "FEATURES=a\u0000b\n", /NUL/],
    ["no equals sign", "FEATURES\n", /no '='/],
  ];
  for (const [name, input, message] of cases) {
    const dir = setup();
    // A valid line first: the whole input is refused, not only the bad line.
    const r = run(dir, `SMTP_PASSWORD=good\n${input}`);
    assert.equal(r.status, 1, name);
    assert.match(r.stderr, message, name);
    assert.match(r.stderr, /\.env is unchanged/, name);
    assert.equal(envOf(dir), HOST_ENV, name);
    assert.deepEqual(backups(dir), [], name);
  }
});

test("US-DEV-06: a line break inside a value cannot smuggle a second key in", () => {
  // On stdin a value with a line break arrives as two lines; the second must pass the same checks.
  const dir = setup();
  const r = run(dir, "FEATURES=a\nBACKUP_DIR=/evil\n");
  assert.equal(r.status, 1);
  assert.equal(envOf(dir), HOST_ENV);
});

test("US-DEV-06: a missing .env is created from the template, placeholders are named", () => {
  const dir = setup({ env: null });
  const r = run(dir, "POSTGRES_PASSWORD=fresh\nDB_OWNER_USER=owner\n");
  assert.equal(r.status, 0, r.stderr);
  const env = envOf(dir);
  assert.match(env, /^POSTGRES_PASSWORD=fresh$/m);
  assert.match(env, /^#DB_OWNER_USER=pflanzendex_owner$/m);
  assert.match(env, /^DB_OWNER_USER=owner$/m);
  assert.match(env, /^# template$/m);
  assert.equal(statSync(join(dir, ".env")).mode & 0o777, 0o600);
  assert.match(r.stdout, /created from the template/);
  assert.match(
    r.stderr,
    /still a placeholder from \.env\.example: DB_OWNER_PASSWORD MAIL_UI_HASH$/m,
  );
  assert.deepEqual(backups(dir), []);
});

test("US-DEV-06: no input leaves .env as it is, also when it is missing", () => {
  const dir = setup({ env: null });
  const r = run(dir, "");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no values/);
  assert.deepEqual(readdirSync(dir), ["example"]);
});

test("US-DEV-06: only the newest 5 backups are kept", () => {
  const dir = setup();
  for (const t of [
    "20200101T000000Z",
    "20200102T000000Z",
    "20200103T000000Z",
    "20200104T000000Z",
    "20200105T000000Z",
  ])
    writeFileSync(join(dir, `.env.bak-${t}`), "old");
  assert.equal(run(dir, "FEATURES=social\n").status, 0);
  const left = backups(dir).sort();
  assert.equal(left.length, 5);
  assert.ok(!left.includes(".env.bak-20200101T000000Z"));
});

test("US-DEV-06: the allowlist of the real .env.example accepts FEATURES and refuses BACKUP_REMOTE", () => {
  const dir = setup({ example: readFileSync(repoExample, "utf8") });
  assert.equal(run(dir, "FEATURES=social\nCATALOG_FILL=on\n").status, 0);
  const r = run(dir, "BACKUP_REMOTE=user@evil:/x\n");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /BACKUP_REMOTE is not on the allowlist/);
});

test("US-DEV-06: the shell reads the written values literally", () => {
  const dir = setup();
  const tricky = 'a b$HOME#x"y`id`';
  assert.equal(run(dir, `SMTP_PASSWORD=${tricky}\nFEATURES=social,ai\n`).status, 0);
  const r = spawnSync(
    "bash",
    ["-c", 'set -a; . ./.env; set +a; printf "%s\\n%s" "$SMTP_PASSWORD" "$FEATURES"'],
    { cwd: dir, encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${tricky}\nsocial,ai`);
});

test("US-DEV-06: docker compose reads the written values like the shell (skipped without docker)", (t) => {
  const probe = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
  if (probe.status !== 0) return t.skip("docker compose is not available");
  const dir = setup();
  const tricky = 'a b$HOME#x"y';
  assert.equal(run(dir, `SMTP_PASSWORD=${tricky}\nFEATURES=social,ai\n`).status, 0);
  writeFileSync(
    join(dir, "compose.yml"),
    "services:\n  s:\n    image: busybox\n    environment:\n      P: ${SMTP_PASSWORD}\n      F: ${FEATURES}\n",
  );
  const r = spawnSync(
    "docker",
    ["compose", "--env-file", ".env", "-f", "compose.yml", "config", "--format", "json"],
    {
      cwd: dir,
      encoding: "utf8",
    },
  );
  assert.equal(r.status, 0, r.stderr);
  const env = JSON.parse(r.stdout).services.s.environment;
  // compose escapes `$` as `$$` in its output of the resolved model.
  assert.equal(env.P.replaceAll("$$", "$"), tricky);
  assert.equal(env.F, "social,ai");
});

test("US-DEV-06: rotation guard: same password is unchanged, a new one is set where the host has none", () => {
  const dir = setup();
  let r = run(dir, "POSTGRES_PASSWORD=oldpassword\n");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /POSTGRES_PASSWORD unchanged/);
  // Quoted on the host, plain from GitHub: the same value, so unchanged and the host line stays.
  const quoted = setup({ env: "POSTGRES_PASSWORD='oldpassword'\n" });
  r = run(quoted, "POSTGRES_PASSWORD=oldpassword\n");
  assert.match(r.stdout, /POSTGRES_PASSWORD unchanged/);
  assert.equal(envOf(quoted), "POSTGRES_PASSWORD='oldpassword'\n");
  // No host value (commented in the template, empty, or a placeholder): set.
  r = run(dir, "KEYCLOAK_ADMIN_PASSWORD=firstvalue\n");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /KEYCLOAK_ADMIN_PASSWORD added/);
  const fresh = setup({ env: null });
  r = run(fresh, "POSTGRES_PASSWORD=fromgithub\n");
  assert.equal(r.status, 0, r.stderr);
  assert.match(envOf(fresh), /^POSTGRES_PASSWORD=fromgithub$/m);
});

test("US-DEV-06: rotation guard: a different value for a password the database does not follow stops the run", () => {
  const dir = setup();
  const r = run(dir, "FEATURES=social\nPOSTGRES_PASSWORD=Different1Secret\n");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /POSTGRES_PASSWORD differs from the host value/);
  assert.match(r.stderr, /ALLOW_PASSWORD_ROTATION=1/);
  assert.match(r.stderr, /staging-deploy-and-backup\.md/);
  assert.equal(envOf(dir), HOST_ENV);
  assert.deepEqual(backups(dir), []);
  for (const v of ["Different1Secret", "oldpassword"]) {
    assert.ok(!r.stdout.includes(v) && !r.stderr.includes(v), v);
  }
});

test("US-DEV-06: rotation guard: passwords the one-shots set on every up are replaced", () => {
  const dir = setup({ env: "DB_OWNER_PASSWORD=ownerold\n" });
  const r = run(dir, "DB_OWNER_PASSWORD=ownernew\n");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /DB_OWNER_PASSWORD changed/);
  assert.equal(envOf(dir), "DB_OWNER_PASSWORD=ownernew\n");
});

test("US-DEV-06: rotation guard: ALLOW_PASSWORD_ROTATION=1 sets a different value", () => {
  const dir = setup();
  const r = run(dir, "POSTGRES_PASSWORD=rotated\n", { ALLOW_PASSWORD_ROTATION: "1" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /POSTGRES_PASSWORD changed/);
  assert.match(envOf(dir), /^POSTGRES_PASSWORD=rotated$/m);
  assert.equal(backups(dir).length, 1);
  assert.ok(!r.stdout.includes("rotated") && !r.stderr.includes("rotated"));
});

test("US-DEV-06: the real .env.example guards the passwords the database does not follow", () => {
  const text = readFileSync(repoExample, "utf8");
  const line = text.match(/^# init-only:(.*)$/m);
  assert.ok(line);
  const names = line[1].trim().split(/\s+/);
  for (const n of [
    "POSTGRES_PASSWORD",
    "POSTGRES_USER",
    "POSTGRES_DB",
    "KEYCLOAK_ADMIN_PASSWORD",
    "SMTP_PASSWORD",
  ])
    assert.ok(names.includes(n), n);
  // db-roles and keycloak-db run ALTER ROLE ... PASSWORD on every up: these may be replaced.
  for (const n of ["DB_OWNER_PASSWORD", "KEYCLOAK_DB_PASSWORD"]) assert.ok(!names.includes(n), n);
  const roles = readFileSync(
    fileURLToPath(
      new URL("../../../../config/deploy/docker/db-roles/init-db-roles.sh", import.meta.url),
    ),
    "utf8",
  );
  assert.match(roles, /alter role %I with login .* password %L/);
  const kc = readFileSync(
    fileURLToPath(new URL("../../../../config/deploy/keycloak/init-db.sh", import.meta.url)),
    "utf8",
  );
  assert.match(kc, /alter role %I with login .* password %L/);
});
