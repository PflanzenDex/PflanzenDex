// US-DEV-08 (#1487): `make worktree` puts the new worktree into the main checkout's .worktrees, also when it runs inside another
// worktree, and leaves it ready to commit in: its dependencies are an own copy of an install with the same lock file, and
// `make setup` runs there. The script runs for real in a throwaway repository with a bare origin; `make` is a stub on PATH that
// records its arguments, and the claim check is skipped with its documented opt-out (SKIP_CLAIM_CHECK=1).
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
// The files the script needs in a checkout: the script, the env writer, the dependency copy and its stamp check.
const FILES = [
  "tools/repo/worktree-new.sh",
  "app/tools/workflow/worktree/worktree-env.mjs",
  "tools/repo/deps-reuse.mjs",
  "app/tools/check/supply/check-deps.mjs",
];
const LOCK = '{"lockfileVersion":3}\n';
const made = [];

after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** Runs git with a fixed identity, failing loudly: the fixture repository is part of the test. */
function git(cwd, ...args) {
  return execFileSync(
    "git",
    ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...args],
    { cwd, stdio: "pipe" },
  ).toString();
}

/** An installed tree as `make setup` leaves it: node_modules with the lock hash in its stamp. */
function installed(app) {
  const nm = path.join(app, "node_modules");
  mkdirSync(path.join(nm, "left-pad"), { recursive: true });
  writeFileSync(path.join(nm, "left-pad", "index.js"), "module.exports = 1;\n");
  const hash = createHash("sha256")
    .update(readFileSync(path.join(app, "package-lock.json")))
    .digest("hex");
  writeFileSync(path.join(nm, ".setup-lock-hash"), `${hash}\n`);
}

/** A main checkout with a bare origin that has `dev`, the script files and an installed node_modules (unless `withDeps` is false). */
function fixture({ withDeps = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "worktree-new-"));
  made.push(root);
  const origin = path.join(root, "origin.git");
  const main = path.join(root, "main");
  git(root, "init", "-q", "--bare", origin);
  mkdirSync(main);
  git(main, "init", "-q", "-b", "dev");
  for (const file of FILES) {
    mkdirSync(path.dirname(path.join(main, file)), { recursive: true });
    copyFileSync(path.join(repoRoot, file), path.join(main, file));
  }
  mkdirSync(path.join(main, "app"), { recursive: true });
  writeFileSync(path.join(main, "app", "package-lock.json"), LOCK);
  git(main, "add", "-A");
  git(main, "commit", "-q", "-m", "chore(dev): fixture");
  git(main, "remote", "add", "origin", origin);
  git(main, "push", "-q", "origin", "dev");
  if (withDeps) installed(path.join(main, "app"));
  return { root, main };
}

/** A `make` stub that records its arguments; `failing` makes it exit 1, as a failed make setup would. */
function stubMake(root, { failing = false } = {}) {
  const bin = path.join(root, failing ? "bin-failing" : "bin");
  mkdirSync(bin, { recursive: true });
  const log = path.join(root, failing ? "make-failing.log" : "make.log");
  writeFileSync(
    path.join(bin, "make"),
    `#!/bin/sh\necho "$@" >> "${log}"\n${failing ? "exit 1\n" : "exit 0\n"}`,
  );
  chmodSync(path.join(bin, "make"), 0o755);
  return { bin, log };
}

/** Runs the script in `cwd` for `branch`, with the stub make first on PATH and the claim check opted out. */
function worktreeNew(cwd, branch, bin) {
  return spawnSync(
    "bash",
    [path.join(cwd, "tools/repo/worktree-new.sh"), branch],
    {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        SKIP_CLAIM_CHECK: "1",
      },
    },
  );
}

const makeCalls = (log) => (existsSync(log) ? readFileSync(log, "utf8") : "");

test("US-DEV-08: make worktree puts the new worktree into the main checkout's .worktrees (#1487)", () => {
  const { root, main } = fixture();
  const { bin, log } = stubMake(root);
  const res = worktreeNew(main, "feat/gate-x", bin);
  assert.equal(res.status, 0, res.stderr);
  const dir = path.join(main, ".worktrees", "feat-gate-x");
  assert.ok(
    existsSync(path.join(dir, ".env.worktree")),
    "the worktree is in the main checkout's .worktrees",
  );
  assert.ok(
    makeCalls(log).includes(`-C ${dir} setup`),
    "make setup runs in the new worktree",
  );
});

test("US-DEV-08: run inside a worktree, the new worktree still lands in the main checkout's .worktrees (#1487: it nested)", () => {
  const { root, main } = fixture();
  const { bin } = stubMake(root);
  assert.equal(worktreeNew(main, "feat/gate-first", bin).status, 0);
  const first = path.join(main, ".worktrees", "feat-gate-first");
  const res = worktreeNew(first, "feat/gate-second", bin);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(
    existsSync(
      path.join(main, ".worktrees", "feat-gate-second", ".env.worktree"),
    ),
  );
  assert.equal(
    existsSync(path.join(first, ".worktrees")),
    false,
    "nothing nested under the first worktree",
  );
});

test("US-DEV-08: the new worktree is ready to commit in: its dependencies are an own copy, and check-deps passes there", () => {
  const { root, main } = fixture();
  const { bin, log } = stubMake(root);
  assert.equal(worktreeNew(main, "feat/gate-deps", bin).status, 0);
  const dir = path.join(main, ".worktrees", "feat-gate-deps");
  const copied = path.join(dir, "app", "node_modules", "left-pad", "index.js");
  const source = path.join(main, "app", "node_modules", "left-pad", "index.js");
  assert.equal(readFileSync(copied, "utf8"), readFileSync(source, "utf8"));
  assert.notEqual(
    statSync(copied).ino,
    statSync(source).ino,
    "an own copy, no shared file",
  );
  assert.ok(makeCalls(log).includes(`-C ${dir} setup`));
  const check = spawnSync(
    "node",
    [path.join(dir, "app", "tools", "check", "supply", "check-deps.mjs")],
    {
      encoding: "utf8",
    },
  );
  assert.equal(check.status, 0, check.stderr);
});

test("US-DEV-08: without an install to copy the worktree is still created, and make setup installs there", () => {
  const { root, main } = fixture({ withDeps: false });
  const { bin, log } = stubMake(root);
  const res = worktreeNew(main, "feat/gate-fresh", bin);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /deps: not copied \(no installed copy/);
  const dir = path.join(main, ".worktrees", "feat-gate-fresh");
  assert.ok(makeCalls(log).includes(`-C ${dir} setup`));
});

test("US-DEV-08: a make setup that fails leaves the worktree, exits 1 and names the next step", () => {
  const { root, main } = fixture({ withDeps: false });
  const { bin } = stubMake(root, { failing: true });
  const res = worktreeNew(main, "feat/gate-broken", bin);
  assert.equal(res.status, 1);
  assert.match(
    res.stderr,
    /make setup failed in .*feat-gate-broken: run make setup there/,
  );
  assert.ok(
    existsSync(
      path.join(main, ".worktrees", "feat-gate-broken", ".env.worktree"),
    ),
  );
});
