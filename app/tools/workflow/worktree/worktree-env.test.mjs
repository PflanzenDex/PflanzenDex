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
  PORT_BASE,
  PORT_SLOTS,
  copyTree,
  installFolders,
  reuseDeps,
  slotOf,
  slug,
  sourcesFor,
  takenSlots,
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

const SERVICE_KEYS = [
  "PFLANZENDEX_TEST_DB_PORT",
  "PFLANZENDEX_DEV_API_PORT",
  "PFLANZENDEX_DEV_WEB_PORT",
  "PFLANZENDEX_E2E_API_PORT",
  "PFLANZENDEX_E2E_WEB_PORT",
];

test("US-DEV-08: the e2e ports have blocks of their own, apart from the dev ports (issue 1745)", () => {
  const e = worktreeEnv("feat/dev-08-parallel");
  SERVICE_KEYS.forEach((key, block) => {
    const port = Number(e[key]);
    assert.ok(
      port >= PORT_BASE + block * PORT_SLOTS && port < PORT_BASE + (block + 1) * PORT_SLOTS,
      `${key} is outside its block`,
    );
  });
  assert.equal(new Set(SERVICE_KEYS.map((key) => e[key])).size, SERVICE_KEYS.length);
  assert.equal(
    Number(e.PFLANZENDEX_E2E_WEB_PORT) - Number(e.PFLANZENDEX_E2E_API_PORT),
    PORT_SLOTS,
    "the e2e web port has the slot of the e2e API port",
  );
});

test("US-DEV-08: a slot that another worktree holds is skipped, and all five ports move with it (issue 1745)", () => {
  const own = worktreeEnv("feat/a");
  const slot = Number(own.PFLANZENDEX_TEST_DB_PORT) - PORT_BASE;
  const moved = worktreeEnv("feat/a", new Set([slot]));
  assert.equal(Number(moved.PFLANZENDEX_TEST_DB_PORT) - PORT_BASE, slot + 1);
  for (const key of Object.keys(own)) {
    if (key === "PFLANZENDEX_TEST_DB_NAME") {
      assert.equal(moved[key], own[key], "the database name depends on the branch only");
    } else {
      assert.equal(Number(moved[key]) - Number(own[key]), 1, key);
    }
  }
});

test("US-DEV-08: the slot search wraps around past the last slot and skips the taken ones there (issue 1745)", () => {
  const slotIn = (env) => Number(env.PFLANZENDEX_TEST_DB_PORT) - PORT_BASE;
  const start = slotIn(worktreeEnv("feat/a")); // hash slot 342
  assert.ok(start > 0, "the test branch must not start at slot 0");
  const tail = new Set(Array.from({ length: PORT_SLOTS - start }, (_, i) => start + i));
  assert.equal(
    slotIn(worktreeEnv("feat/a", tail)),
    0,
    "after the last slot the search starts at 0",
  );
  assert.equal(slotIn(worktreeEnv("feat/a", new Set([...tail, 0]))), 1, "slot 0 taken too: 1");
});

test("US-DEV-08: a branch is refused when every slot is held, instead of sharing a port (issue 1745)", () => {
  const all = new Set(Array.from({ length: PORT_SLOTS }, (_, i) => i));
  assert.throws(() => worktreeEnv("feat/a", all), /all 500 port slots are held/);
});

test("US-DEV-08: a slot is read from the test database port of a .env.worktree and from nothing else (issue 1745)", () => {
  assert.equal(
    slotOf(
      `PFLANZENDEX_DEV_API_PORT=${PORT_BASE + PORT_SLOTS + 4}\nPFLANZENDEX_TEST_DB_PORT=${PORT_BASE + 7}\n`,
    ),
    7,
  );
  assert.equal(slotOf(`PFLANZENDEX_TEST_DB_PORT=${PORT_BASE + PORT_SLOTS}\n`), undefined);
  assert.equal(slotOf("PFLANZENDEX_DEV_WEB_PORT=55400\n"), undefined);
  assert.equal(slotOf(""), undefined);
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

test("US-DEV-08: the slots of the other worktrees come from their .env.worktree; the own one and a worktree without the file are left out (issue 1745)", async () => {
  const r = scratch();
  const repo = path.join(r, "repo");
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  git(
    repo,
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.test",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "init",
  );
  const other = path.join(r, "other");
  const idle = path.join(r, "idle");
  git(repo, "worktree", "add", "-q", "-b", "feat-other", other);
  git(repo, "worktree", "add", "-q", "-b", "feat-idle", idle);
  writeFileSync(path.join(repo, ".env.worktree"), `PFLANZENDEX_TEST_DB_PORT=${PORT_BASE + 9}\n`);
  writeFileSync(path.join(other, ".env.worktree"), `PFLANZENDEX_TEST_DB_PORT=${PORT_BASE + 7}\n`);
  assert.deepEqual([...(await takenSlots(repo))], [7]);
});
