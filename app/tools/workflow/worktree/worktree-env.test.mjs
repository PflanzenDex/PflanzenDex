// US-DEV-08: unique ports and database names per worktree; the dependency copy of a new worktree (#1487)
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  copyTree,
  installFolders,
  reuseDeps,
  slug,
  sourcesFor,
  worktreeEnv,
} from "./worktree-env.mjs";

test("US-DEV-08: the same branch yields the same values", () => {
  assert.deepEqual(worktreeEnv("feat/a"), worktreeEnv("feat/a"));
});

test("US-DEV-08: different branches yield different database names", () => {
  const names = new Set(
    ["feat/a", "feat/b", "feat-a", "feat_a"].map((b) => worktreeEnv(b).PFLANZENDEX_TEST_DB_NAME),
  );
  assert.equal(names.size, 4);
});

test("US-DEV-08: ports are in the reserved range and never collide with 54329", () => {
  const e = worktreeEnv("feat/dev-08-parallel");
  for (const k of [
    "PFLANZENDEX_TEST_DB_PORT",
    "PFLANZENDEX_DEV_API_PORT",
    "PFLANZENDEX_DEV_WEB_PORT",
  ]) {
    const p = Number(e[k]);
    assert.ok(p >= 54400 && p < 54400 + 3 * 500, k);
  }
});

test("US-DEV-08: the database name is a valid identifier", () => {
  assert.match(
    worktreeEnv("Feat/Ä weird name!!").PFLANZENDEX_TEST_DB_NAME,
    /^pflanzendex_[a-z0-9_]+$/,
  );
  assert.equal(slug("feat/te-02"), "feat_te_02");
});

test("US-DEV-08: an empty branch name aborts", () => {
  assert.throws(() => worktreeEnv(""));
});

const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const scratch = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "worktree-env-"));
  made.push(dir);
  return dir;
};

/** An app folder with a lock file; `installed` adds a node_modules that passed `make setup` (stamp = hash of the lock). */
function app(dir, { lock = '{"lockfileVersion":3}\n', installed = true, stamp = true } = {}) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "package-lock.json"), lock);
  if (installed) {
    const nm = path.join(dir, "node_modules");
    mkdirSync(path.join(nm, "left-pad"), { recursive: true });
    writeFileSync(path.join(nm, "left-pad", "index.js"), "module.exports = 1;\n");
    symlinkSync("../left-pad", path.join(nm, "pad-link")); // relative, as npm writes them
    if (stamp) {
      const hash = createHash("sha256").update(lock).digest("hex");
      writeFileSync(path.join(nm, ".setup-lock-hash"), `${hash}\n`);
    }
  }
  return dir;
}

/** Runs git in `cwd`, failing loudly: the fixture repositories are part of the test. */
function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, stdio: "pipe" }).toString();
}

const NESTED_LOCK = `${JSON.stringify({
  lockfileVersion: 3,
  packages: {
    "": {},
    "node_modules/left-pad": {},
    "packages/web": {},
    "packages/web/node_modules/@hookform/resolvers": {},
  },
})}\n`;

test("US-DEV-08: the copy holds the node_modules of a workspace too (issue 1525)", async () => {
  const r = scratch();
  const src = app(path.join(r, "src"), { lock: NESTED_LOCK });
  const nested = path.join(src, "packages", "web", "node_modules", "@hookform", "resolvers");
  mkdirSync(nested, { recursive: true });
  writeFileSync(path.join(nested, "index.js"), "module.exports = 2;\n");
  const dst = app(path.join(r, "dst"), { lock: NESTED_LOCK, installed: false });
  mkdirSync(path.join(dst, "packages", "web"), { recursive: true });
  assert.deepEqual(installFolders(src), ["node_modules", "packages/web/node_modules"]);
  await copyTree(src, dst);
  const copied = path.join("packages", "web", "node_modules", "@hookform", "resolvers", "index.js");
  assert.equal(readFileSync(path.join(dst, copied), "utf8"), "module.exports = 2;\n");
});

test("US-DEV-08: the copy leaves out the test caches of the source", async () => {
  const r = scratch();
  const src = app(path.join(r, "src"));
  mkdirSync(path.join(src, "node_modules", ".vite", "vitest"), { recursive: true });
  mkdirSync(path.join(src, "node_modules", ".vitest-cache"), { recursive: true });
  const dst = app(path.join(r, "dst"), { installed: false });
  await copyTree(src, dst);
  assert.equal(existsSync(path.join(dst, "node_modules", ".vite")), false);
  assert.equal(existsSync(path.join(dst, "node_modules", ".vitest-cache")), false);
  assert.equal(existsSync(path.join(dst, "node_modules", "left-pad", "index.js")), true);
});

test("US-DEV-08: a stamped install without its workspace folder is no source (issue 1525)", () => {
  const r = scratch();
  const src = app(path.join(r, "src"), { lock: NESTED_LOCK });
  const dst = app(path.join(r, "dst"), { lock: NESTED_LOCK, installed: false });
  assert.deepEqual(sourcesFor(dst, [src]), []);
});

test("US-DEV-08: an install with the same lock file is a source, and its copy shares no file with it", async () => {
  const r = scratch();
  const src = app(path.join(r, "src"));
  const dst = app(path.join(r, "dst"), { installed: false });
  assert.deepEqual(sourcesFor(dst, [src]), [src]);
  await copyTree(src, dst);
  const srcFile = path.join(src, "node_modules", "left-pad", "index.js");
  const dstFile = path.join(dst, "node_modules", "left-pad", "index.js");
  assert.equal(readFileSync(dstFile, "utf8"), readFileSync(srcFile, "utf8"));
  writeFileSync(dstFile, "changed in the new worktree\n");
  assert.equal(
    readFileSync(srcFile, "utf8"),
    "module.exports = 1;\n",
    "a different file, not a hard link",
  );
  assert.equal(
    readlinkSync(path.join(dst, "node_modules", "pad-link")),
    "../left-pad",
    "relative links are kept",
  );
});

test("US-DEV-08: an install with another lock file is no source for the copy", () => {
  const r = scratch();
  const src = app(path.join(r, "src"), { lock: '{"lockfileVersion":3,"other":true}\n' });
  const dst = app(path.join(r, "dst"), { installed: false });
  assert.deepEqual(sourcesFor(dst, [src]), []);
});

test("US-DEV-08: an install whose stamp does not match the lock file is no source (make setup did not finish)", () => {
  const r = scratch();
  const missing = app(path.join(r, "missing"), { stamp: false });
  const wrong = app(path.join(r, "wrong"));
  writeFileSync(path.join(wrong, "node_modules", ".setup-lock-hash"), "0000\n");
  const dst = app(path.join(r, "dst"), { installed: false });
  assert.deepEqual(sourcesFor(dst, [missing, wrong]), []);
});

test("US-DEV-08: a copy that still links into the source is removed again and refused", async () => {
  const r = scratch();
  const src = app(path.join(r, "src"));
  symlinkSync(
    path.join(src, "node_modules", "left-pad"),
    path.join(src, "node_modules", "abs-link"),
  );
  const dst = app(path.join(r, "dst"), { installed: false });
  await assert.rejects(copyTree(src, dst), /points into/);
  assert.equal(statSync(path.join(r, "dst")).isDirectory(), true);
  assert.throws(() => statSync(path.join(dst, "node_modules")), /ENOENT/);
});

test("US-DEV-08: an existing node_modules in the new worktree is never overwritten", async () => {
  const r = scratch();
  const src = app(path.join(r, "src"));
  const dst = app(path.join(r, "dst"));
  const result = await reuseDeps({ target: dst, prefer: src });
  assert.deepEqual(result, { copied: false, reason: "node_modules is already there" });
  assert.equal(
    readFileSync(path.join(dst, "node_modules", "left-pad", "index.js"), "utf8"),
    "module.exports = 1;\n",
  );
});

test("US-DEV-08: without a source nothing is copied, and the reason says that make setup installs", async () => {
  const r = scratch();
  const repo = path.join(r, "repo");
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  const dst = app(path.join(repo, "app"), { installed: false });
  const result = await reuseDeps({ target: dst });
  assert.equal(result.copied, false);
  assert.match(result.reason, /no installed copy with the same package-lock.json/);
  assert.throws(() => statSync(path.join(dst, "node_modules")), /ENOENT/);
});

test("US-DEV-08: reuseDeps copies from the preferred worktree when its install matches the lock file", async () => {
  const r = scratch();
  const repo = path.join(r, "repo");
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  const src = app(path.join(repo, "app"));
  const newWorktree = path.join(r, "new");
  mkdirSync(newWorktree);
  git(newWorktree, "init", "-q", "-b", "main");
  const dst = app(path.join(newWorktree, "app"), { installed: false });
  const result = await reuseDeps({ target: dst, prefer: src });
  assert.equal(result.copied, true);
  assert.equal(result.from, src);
  assert.ok(statSync(path.join(dst, "node_modules", "left-pad")).isDirectory());
});
