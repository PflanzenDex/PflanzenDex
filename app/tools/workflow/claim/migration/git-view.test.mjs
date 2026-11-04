import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { collect, migrationsAt } from "./git-view.mjs";
import { MIGRATIONS_DIR, nextNumber, pad } from "./migration-lib.mjs";

let root;
const git = (...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.org", ...args], {
    cwd: root,
    stdio: "ignore",
  });

// A repository with two migrations on a ref named like the real one.
before(() => {
  root = mkdtempSync(path.join(tmpdir(), "git-view-"));
  mkdirSync(path.join(root, MIGRATIONS_DIR), { recursive: true });
  for (const name of ["0097_a.sql", "0098_b.sql"])
    writeFileSync(path.join(root, MIGRATIONS_DIR, name), "select 1;\n");
  git("init", "-q");
  git("add", ".");
  git("commit", "-q", "--no-verify", "-m", "x");
  git("update-ref", "refs/remotes/origin/dev", "HEAD");
});
after(() => rmSync(root, { recursive: true, force: true }));

test("US-DEV-08: the migrations of a ref are found from any directory of the repo", () => {
  const expected = ["0097_a.sql", "0098_b.sql"];
  assert.deepEqual(migrationsAt("origin/dev", root), expected);
  // `make claim` runs in app/; a path relative to the working directory found nothing there (issue 1265).
  assert.deepEqual(migrationsAt("origin/dev", path.join(root, "app")), expected);
});

test("US-DEV-08: a claim from app/ reserves the number after the highest one on origin/dev", () => {
  const { taken } = collect({ cwd: path.join(root, "app"), branch: "", prs: [] });
  assert.equal(pad(nextNumber({ taken })), "0099");
});

test("US-DEV-08: a ref that does not exist stays undefined, not an empty list", () => {
  assert.equal(migrationsAt("origin/nothing", path.join(root, "app")), undefined);
});
