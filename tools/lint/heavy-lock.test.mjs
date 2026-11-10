// US-DEV-08 (issue 1745, slice 2): `tools/lint/heavy-lock.sh` holds one machine-wide lock for a heavy job. The owners are short-lived
// `sleep` processes, whose pids the script watches. The script runs for real, with setsid and flock, in a throwaway lock folder
// (HEAVY_LOCK_DIR), so nothing of the checkout's git directory is touched.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "heavy-lock.sh");
const folders = [];
const owners = [];
after(() => {
  for (const child of owners) child.kill("SIGKILL");
  for (const dir of folders) rmSync(dir, { recursive: true, force: true });
});

// The environment of a call: the test's own HEAVY_LOCK_WAIT never leaks into a call that does not name one.
function envOf(extra) {
  const env = { ...process.env, ...extra };
  if (!("HEAVY_LOCK_WAIT" in extra)) delete env.HEAVY_LOCK_WAIT;
  return env;
}

function lockFolder() {
  const dir = mkdtempSync(path.join(tmpdir(), "heavy-lock-"));
  folders.push(dir);
  return dir;
}

// A short-lived owner process. Its pid is the owner the script watches.
function owner(seconds = 120) {
  const child = spawn("sleep", [String(seconds)], { stdio: "ignore" });
  owners.push(child);
  return child;
}

const ended = (child) =>
  new Promise((resolve) => child.once("exit", () => resolve(performance.now())));

function heavyLock(args, extra = {}) {
  return spawnSync("bash", ["-c", '"$0" "$@"', script, ...args], {
    encoding: "utf8",
    env: envOf({ HEAVY_LOCK_DIR: extra.HEAVY_LOCK_DIR ?? lockFolder(), ...extra }),
    timeout: 30_000,
  });
}

// The same call, started and not waited for: its output and its end are collected as they come.
function heavyLockAsync(args, extra) {
  const child = spawn("bash", ["-c", '"$0" "$@"', script, ...args], {
    env: envOf(extra),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const call = { out: "", err: "", endedAt: 0 };
  child.stdout.on("data", (chunk) => {
    call.out += chunk;
  });
  child.stderr.on("data", (chunk) => {
    call.err += chunk;
  });
  call.done = new Promise((resolve) =>
    child.on("close", (code) => {
      call.endedAt = performance.now();
      resolve(code);
    }),
  );
  return call;
}

async function until(check, ms = 10_000) {
  const end = Date.now() + ms;
  while (!check()) {
    assert.ok(Date.now() < end, "condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const noteOf = (dir) => readFileSync(path.join(dir, "heavy-job.owner"), "utf8");

test("US-DEV-08: the first owner gets the lock at once, silently, and its note names it", () => {
  const dir = lockFolder();
  const a = owner();
  const started = performance.now();
  const result = heavyLock([String(a.pid), "e2e"], { HEAVY_LOCK_DIR: dir });
  const seconds = (performance.now() - started) / 1000;
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.ok(seconds < 2, `took ${seconds} s`);
  assert.match(
    noteOf(dir),
    new RegExp(`^${a.pid} \\S.* e2e \\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ\\n$`),
  );
});

test("US-DEV-08: a second owner says which job it waits for and gets the lock within 2 s after the first owner ends", async () => {
  const dir = lockFolder();
  const first = owner(4);
  const firstEnded = ended(first);
  assert.equal(heavyLock([String(first.pid), "e2e"], { HEAVY_LOCK_DIR: dir }).status, 0);
  const second = owner();
  const waiting = heavyLockAsync([String(second.pid), "ui-gates"], {
    HEAVY_LOCK_DIR: dir,
    HEAVY_LOCK_WAIT: "60",
  });
  await until(() => waiting.out.includes("waiting for ui-gates"));
  assert.match(
    waiting.out,
    /^heavy-lock: waiting for ui-gates in .+ \(since \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\), one heavy job at a time \(US-DEV-08\)$/m,
  );
  assert.match(waiting.out, /^heavy-lock: held by .+ e2e \(pid \d+, since \S+Z\)$/m);
  const firstEndedAt = await firstEnded;
  assert.equal(await waiting.done, 0, waiting.err);
  const gap = (waiting.endedAt - firstEndedAt) / 1000;
  assert.ok(gap < 3, `second owner got the lock ${gap.toFixed(2)} s after the first ended`);
  assert.match(noteOf(dir), new RegExp(`^${second.pid} `));
  assert.match(waiting.out, /the lock is ours after \d+ s, ui-gates starts/);
});

test("US-DEV-08: the lock is released when the first owner is killed", async () => {
  const dir = lockFolder();
  const first = owner();
  assert.equal(heavyLock([String(first.pid), "e2e"], { HEAVY_LOCK_DIR: dir }).status, 0);
  const second = owner();
  const waiting = heavyLockAsync([String(second.pid), "lighthouse"], {
    HEAVY_LOCK_DIR: dir,
    HEAVY_LOCK_WAIT: "60",
  });
  await until(() => waiting.out.includes("waiting for lighthouse"));
  const firstEnded = ended(first);
  const killedAt = performance.now();
  first.kill("SIGKILL");
  await firstEnded;
  assert.equal(await waiting.done, 0, waiting.err);
  const gap = (waiting.endedAt - killedAt) / 1000;
  assert.ok(gap < 3, `second owner got the lock ${gap.toFixed(2)} s after the kill`);
});

test("US-DEV-08: the same owner pid again returns at once and takes no second lock", () => {
  const dir = lockFolder();
  const a = owner();
  assert.equal(heavyLock([String(a.pid), "e2e"], { HEAVY_LOCK_DIR: dir }).status, 0);
  const started = performance.now();
  const nested = heavyLock([String(a.pid), "ci"], { HEAVY_LOCK_DIR: dir });
  const seconds = (performance.now() - started) / 1000;
  assert.equal(nested.status, 0, nested.stderr);
  assert.equal(nested.stdout, "");
  assert.ok(seconds < 1, `nested call took ${seconds} s`);
  const note = noteOf(dir);
  assert.match(note, / e2e \d{4}/, "the first job still holds the lock");
  assert.doesNotMatch(note, / ci \d{4}/);
});

test("US-DEV-08: the note of a dead owner does not block; the lock decides", async () => {
  const dir = lockFolder();
  const gone = owner();
  const goneEnded = ended(gone);
  gone.kill("SIGKILL");
  await goneEnded;
  writeFileSync(
    path.join(dir, "heavy-job.owner"),
    `${gone.pid} /old/checkout e2e 2026-11-01T10:00:00Z\n`,
  );
  const b = owner();
  const result = heavyLock([String(b.pid), "one-screen"], {
    HEAVY_LOCK_DIR: dir,
    HEAVY_LOCK_WAIT: "10",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.match(noteOf(dir), new RegExp(`^${b.pid} `));
});

test("US-DEV-08: HEAVY_LOCK_WAIT gives up with exit 1, names the holder and leaves no holder behind", async () => {
  const dir = lockFolder();
  const a = owner();
  assert.equal(heavyLock([String(a.pid), "e2e"], { HEAVY_LOCK_DIR: dir }).status, 0);
  const b = owner();
  const gaveUp = heavyLock([String(b.pid), "a11y-routes"], {
    HEAVY_LOCK_DIR: dir,
    HEAVY_LOCK_WAIT: "1",
  });
  assert.equal(gaveUp.status, 1, gaveUp.stdout);
  assert.match(gaveUp.stderr, /gave up after 1 s, a11y-routes in .+ did not run/);
  assert.match(gaveUp.stderr, /held by .+ e2e \(pid \d+, since /);
  assert.match(noteOf(dir), new RegExp(`^${a.pid} `), "the holder of the first job keeps the note");

  // The holder that b started is gone: once the first owner ends, a third owner gets the lock at once.
  const aEnded = ended(a);
  a.kill("SIGKILL");
  await aEnded;
  const c = owner();
  const third = heavyLock([String(c.pid), "x"], { HEAVY_LOCK_DIR: dir, HEAVY_LOCK_WAIT: "10" });
  assert.equal(third.status, 0, third.stderr);
  assert.match(noteOf(dir), new RegExp(`^${c.pid} `));
});

test("US-DEV-08: a pid that is not a number and a wait below 1 second are refused with exit 2", () => {
  const dir = lockFolder();
  const a = owner();
  const notAPid = heavyLock(["not-a-pid", "e2e"], { HEAVY_LOCK_DIR: dir });
  assert.equal(notAPid.status, 2);
  assert.match(notAPid.stderr, /usage: heavy-lock.sh/);
  const noWait = heavyLock([String(a.pid), "e2e"], { HEAVY_LOCK_DIR: dir, HEAVY_LOCK_WAIT: "0" });
  assert.equal(noWait.status, 2);
  assert.match(noWait.stderr, /at least 1 second/);
});
