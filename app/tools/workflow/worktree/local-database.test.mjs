// Tests of the local-only guard of `make db-reset`, `make db-seed` and `make pokedex-build` (US-DEV-01): the targets work on
// the test database of this worktree and on nothing else.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { localDatabaseRefusal } from "./local-database.mjs";

const WORKTREE = "postgres://postgres:postgres@127.0.0.1:54697/pflanzendex_test";
const cli = fileURLToPath(new URL("./local-database.mjs", import.meta.url));

test("US-DEV-01 the worktree's own test database with no other variable is allowed", () => {
  assert.equal(localDatabaseRefusal({}, WORKTREE), undefined);
});

test("US-DEV-01 PFLANZENDEX_ENV local and test are allowed; prod, production and unknown names are refused", () => {
  for (const name of ["local", "test"])
    assert.equal(localDatabaseRefusal({ PFLANZENDEX_ENV: name }, WORKTREE), undefined, name);
  for (const name of ["prod", "production", "staging"]) {
    assert.match(
      localDatabaseRefusal({ PFLANZENDEX_ENV: name }, WORKTREE),
      /PFLANZENDEX_ENV is '/,
      name,
    );
  }
});

test("US-DEV-01 a DATABASE_URL on another host is refused: the target never reaches a database that is not on this machine", () => {
  const reason = localDatabaseRefusal(
    { DATABASE_URL: "postgres://app:secret@db.staging.example.org:5432/pflanzendex" },
    WORKTREE,
  );
  assert.match(reason, /not on this machine/);
});

test("US-DEV-01 a DATABASE_URL on this machine but another database is refused: only this worktree's database", () => {
  const reason = localDatabaseRefusal(
    { DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:54329/pflanzendex_test" },
    WORKTREE,
  );
  assert.match(reason, /not this worktree's test database/);
});

test("US-DEV-01 a DATABASE_URL equal to this worktree's test database is allowed", () => {
  assert.equal(localDatabaseRefusal({ DATABASE_URL: WORKTREE }, WORKTREE), undefined);
});

test("US-DEV-01 a worktree database URL that is not on this machine is refused, whatever DATABASE_URL says", () => {
  const reason = localDatabaseRefusal(
    {},
    "postgres://postgres:postgres@10.0.0.7:5432/pflanzendex_test",
  );
  assert.match(reason, /not on this machine/);
});

test("US-DEV-01 a DATABASE_URL that cannot be parsed is refused", () => {
  assert.match(localDatabaseRefusal({ DATABASE_URL: "not a url" }, WORKTREE), /cannot be parsed/);
});

test("US-DEV-01 NODE_ENV production is refused", () => {
  assert.match(
    localDatabaseRefusal({ NODE_ENV: "production" }, WORKTREE),
    /NODE_ENV is 'production'/,
  );
});

test("US-DEV-01 the command prints the refusal and exits 1 when DATABASE_URL points to staging", () => {
  const r = spawnSync(process.execPath, [cli, WORKTREE], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, DATABASE_URL: "postgres://u:p@db.example.org:5432/pflanzendex" },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not on this machine/);
});

test("US-DEV-01 the command exits 0 for the worktree's own database", () => {
  const r = spawnSync(process.execPath, [cli, WORKTREE], {
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
  assert.equal(r.status, 0, r.stderr);
});
