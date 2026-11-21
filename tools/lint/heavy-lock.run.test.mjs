// US-DEV-08 (issue 2370): `make heavy RUN="<command>"` runs one command under the heavy lock and releases the lock when the command
// ends. tools/lint/heavy-lock.run.sh runs the command (RAW_RUN) in its own process group and exits with its exit code. The lock is the
// prerequisite heavy-lock of the make process, so the make tests take the lock through make, in a throwaway lock folder
// (HEAVY_LOCK_DIR). A command writes its pid to a file; that pid is its process group id, and the tests check the group by it.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const wrapper = path.join(here, "heavy-lock.run.sh");
const lockScript = path.join(here, "heavy-lock.sh");
const folders = [];
const children = [];
const groups = [];
after(() => {
  for (const child of children) child.kill("SIGKILL");
  for (const pgid of groups) {
    try {
      process.kill(-pgid, "SIGKILL");
    } catch {
      // The group has ended already.
    }
  }
  for (const dir of folders) rmSync(dir, { recursive: true, force: true });
});

// The environment of a call: none of the caller's heavy-job variables leak in (CI skips the lock, and an owner, a target or a
// hold time of the caller's own make would change the call), unless the test names one.
const HEAVY_VARIABLES = [
  "CI",
  "PFLANZENDEX_HEAVY_OWNER",
  "PFLANZENDEX_HEAVY_TARGET",
  "HEAVY_LOCK_WAIT",
  "HEAVY_LOCK_MAX_HOLD",
  "RAW_RUN",
];
function envOf(extra) {
  const env = { ...process.env, ...extra };
  for (const name of HEAVY_VARIABLES) if (!(name in extra)) delete env[name];
  return env;
}

function lockFolder() {
  const dir = mkdtempSync(path.join(tmpdir(), "heavy-lock-run-"));
  folders.push(dir);
  return dir;
}

const noteOf = (dir) => path.join(dir, "heavy-job.owner");

// A short-lived owner process. Its pid is the owner the script watches.
function owner(seconds = 120) {
  const child = spawn("sleep", [String(seconds)], { stdio: "ignore" });
  children.push(child);
  return child;
}

// Resolves with the exit code and signal of a child, from the moment it is called (attach before the child can end).
const exited = (child) =>
  new Promise((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal, at: performance.now() })),
  );

async function until(check, ms, what) {
  const end = Date.now() + ms;
  while (!check()) {
    assert.ok(Date.now() < end, `${what} was not reached in ${ms} ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// Whether a process of the group is alive: kill with signal 0 to the group. EPERM means alive too.
function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

const processAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const pidFileReady = (file) => existsSync(file) && readFileSync(file, "utf8").trim() !== "";

// The wrapper, started with the owner and a command. The command writes its pid to HEAVY_TEST_PIDFILE, from the test's environment.
function startWrapper(ownerPid, command, extra = {}) {
  const child = spawn(wrapper, [String(ownerPid)], {
    env: envOf({ RAW_RUN: command, ...extra }),
    stdio: "ignore",
  });
  children.push(child);
  return child;
}

// Waits until the command has written its pid, and returns it (the process group id of the command).
async function commandGroup(pidFile) {
  await until(() => pidFileReady(pidFile), 20_000, "the command's pid file");
  const pgid = Number(readFileSync(pidFile, "utf8").trim());
  groups.push(pgid);
  assert.ok(groupAlive(pgid), "the command's group is not running");
  return pgid;
}

// make on the Makefile of this checkout. exec makes make the process of the call, so the test holds make's pid.
const makeArgs = (goals) => ["-c", 'exec make "$@"', "make", ...goals];

function makeCall(goals, extra) {
  return spawnSync("bash", makeArgs(goals), {
    cwd: repo,
    encoding: "utf8",
    env: envOf(extra),
    timeout: 120_000,
  });
}

function makeStart(goals, extra) {
  const child = spawn("bash", makeArgs(goals), {
    cwd: repo,
    env: envOf(extra),
    stdio: "ignore",
  });
  children.push(child);
  return child;
}

// A second taker of the lock, run to the end with spawnSync: it returns at once when the lock is free.
function takeLock(dir, target) {
  const taker = owner();
  const started = performance.now();
  const result = spawnSync("bash", ["-c", '"$0" "$@"', lockScript, String(taker.pid), target], {
    encoding: "utf8",
    env: envOf({ HEAVY_LOCK_DIR: dir, HEAVY_LOCK_WAIT: "10" }),
    timeout: 30_000,
  });
  return { ...result, seconds: (performance.now() - started) / 1000, taker };
}

// A second taker that waits: its output and its end are collected as they come.
function takeLockAsync(dir, target) {
  const taker = owner();
  const child = spawn("bash", ["-c", '"$0" "$@"', lockScript, String(taker.pid), target], {
    env: envOf({ HEAVY_LOCK_DIR: dir, HEAVY_LOCK_WAIT: "60" }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  const call = { out: "", err: "", endedAt: 0 };
  child.stdout.on("data", (chunk) => {
    call.out += chunk;
  });
  child.stderr.on("data", (chunk) => {
    call.err += chunk;
  });
  call.done = exited(child).then(({ code, at }) => {
    call.endedAt = at;
    return code;
  });
  return call;
}

test("US-DEV-08 (issue 2370): make heavy runs its command; when the command ends the lock is free and a second taker gets it at once", async () => {
  const dir = lockFolder();
  const made = makeCall(["heavy", "RUN=exit 0"], { HEAVY_LOCK_DIR: dir });
  assert.equal(made.status, 0, made.stderr);
  await until(() => !existsSync(noteOf(dir)), 5000, "the end of the note of the finished make");
  const taker = takeLock(dir, "ui-gates");
  assert.equal(taker.status, 0, taker.stderr);
  assert.equal(taker.stdout, "");
  assert.ok(taker.seconds < 3, `the second taker took ${taker.seconds.toFixed(2)} s`);
});

test("US-DEV-08 (issue 2370): a failing command passes its exit code on: make ends with 2 and names the code, and the lock is free", async () => {
  const dir = lockFolder();
  const made = makeCall(["heavy", "RUN=exit 3"], { HEAVY_LOCK_DIR: dir });
  assert.equal(made.status, 2, made.stderr);
  assert.match(made.stderr, /\] Error 3$/m);
  await until(() => !existsSync(noteOf(dir)), 5000, "the end of the note of the failed make");
  const taker = takeLock(dir, "ui-gates");
  assert.equal(taker.status, 0, taker.stderr);
  assert.ok(taker.seconds < 3, `the second taker took ${taker.seconds.toFixed(2)} s`);
});

for (const signal of ["SIGTERM", "SIGKILL"]) {
  test(`US-DEV-08 (issue 2370): ${signal} to make ends the command's group and frees the lock within a few seconds`, async () => {
    const dir = lockFolder();
    const pidFile = path.join(dir, "command.pid");
    const made = makeStart(["heavy", `RUN=printf %s $$ > "$HEAVY_TEST_PIDFILE"; sleep 120`], {
      HEAVY_LOCK_DIR: dir,
      HEAVY_TEST_PIDFILE: pidFile,
    });
    const pgid = await commandGroup(pidFile);
    // The lock is make's: a second taker waits for it.
    const waiting = takeLockAsync(dir, "lighthouse");
    await until(() => waiting.out.includes("waiting for lighthouse"), 10_000, "the wait line");
    const madeEnded = exited(made);
    const killedAt = performance.now();
    made.kill(signal);
    await madeEnded;
    assert.equal(await waiting.done, 0, waiting.err);
    const seconds = (waiting.endedAt - killedAt) / 1000;
    assert.ok(seconds < 5, `the second taker got the lock ${seconds.toFixed(2)} s after the kill`);
    await until(() => !groupAlive(pgid), 6000, "the end of the command's group");
  });
}

test("US-DEV-08 (issue 2370): make heavy without RUN, with an empty or a blank RUN, is refused with exit 2 before the lock is taken", async () => {
  const dir = lockFolder();
  for (const goals of [["heavy"], ["heavy", "RUN="], ["heavy", "RUN=   "]]) {
    const refused = makeCall(goals, { HEAVY_LOCK_DIR: dir });
    assert.equal(refused.status, 2, `make ${goals.join(" ")}: ${refused.stderr}`);
    assert.match(refused.stderr, /heavy: RUN is empty, use make heavy RUN=/);
    assert.equal(existsSync(noteOf(dir)), false, `make ${goals.join(" ")} wrote a note`);
  }
  assert.equal(
    existsSync(path.join(dir, "heavy-job.lock")),
    false,
    "a refused call created the lock file",
  );
  const taker = takeLock(dir, "ui-gates");
  assert.equal(taker.status, 0, taker.stderr);
  assert.equal(taker.stdout, "", "the lock was not free");
  assert.ok(taker.seconds < 2, `the lock was taken after ${taker.seconds.toFixed(2)} s`);
});

test("US-DEV-08 (issue 2370): make passes RUN to the command raw: make does not expand what the command text contains", () => {
  const dir = lockFolder();
  const out = path.join(dir, "raw-run.txt");
  const run = `printf '%s' "$RAW_RUN" > "$HEAVY_TEST_OUT"; : '$(HEAVY_PROBE) $$ $(shell echo expanded)'`;
  const made = makeCall(["heavy", `RUN=${run}`], { HEAVY_LOCK_DIR: dir, HEAVY_TEST_OUT: out });
  assert.equal(made.status, 0, made.stderr);
  assert.equal(readFileSync(out, "utf8"), run);
});

test("US-DEV-08 (issue 2370): in CI heavy-lock is a no-op: make heavy runs the command without taking the lock", () => {
  const dir = lockFolder();
  const made = makeCall(["heavy", "RUN=exit 0"], { HEAVY_LOCK_DIR: dir, CI: "true" });
  assert.equal(made.status, 0, made.stderr);
  assert.equal(existsSync(noteOf(dir)), false, "CI wrote a note");
  assert.equal(existsSync(path.join(dir, "heavy-job.lock")), false, "CI created the lock file");
});

test("US-DEV-08 (issue 2370): heavy-lock.run.sh refuses a missing, empty or blank RAW_RUN with exit 2 and the usage line", () => {
  for (const extra of [{}, { RAW_RUN: "" }, { RAW_RUN: " \t " }]) {
    const refused = spawnSync(wrapper, [String(process.pid)], {
      encoding: "utf8",
      env: envOf(extra),
      timeout: 10_000,
    });
    assert.equal(refused.status, 2, refused.stderr);
    assert.match(refused.stderr, /usage: make heavy RUN="<command>"/);
  }
});

test("US-DEV-08 (issue 2370): heavy-lock.run.sh exits with the exit code of the command", () => {
  const holder = owner();
  for (const [command, code] of [
    ["true", 0],
    ["exit 3", 3],
    ["sh -c 'exit 7'", 7],
  ]) {
    const ran = spawnSync(wrapper, [String(holder.pid)], {
      encoding: "utf8",
      env: envOf({ RAW_RUN: command }),
      timeout: 30_000,
    });
    assert.equal(ran.status, code, `${command}: ${ran.stderr}`);
  }
});

test("US-DEV-08 (issue 2370): SIGTERM to heavy-lock.run.sh stops the command's group and exits with the command's end code", async () => {
  const dir = lockFolder();
  const pidFile = path.join(dir, "command.pid");
  const holder = owner();
  const wrap = startWrapper(holder.pid, `printf %s $$ > "$HEAVY_TEST_PIDFILE"; sleep 120`, {
    HEAVY_TEST_PIDFILE: pidFile,
  });
  const pgid = await commandGroup(pidFile);
  const ended = exited(wrap);
  wrap.kill("SIGTERM");
  const { code } = await ended;
  assert.equal(code, 143);
  await until(() => !groupAlive(pgid), 5000, "the end of the command's group");
  assert.ok(processAlive(holder.pid), "the owner was stopped");
});

test("US-DEV-08 (issue 2370): SIGINT to heavy-lock.run.sh is forwarded to the command's group, which ends with 130 (it does not ignore INT)", async () => {
  const dir = lockFolder();
  const pidFile = path.join(dir, "command.pid");
  const holder = owner();
  const wrap = startWrapper(holder.pid, `printf %s $$ > "$HEAVY_TEST_PIDFILE"; sleep 120`, {
    HEAVY_TEST_PIDFILE: pidFile,
  });
  const pgid = await commandGroup(pidFile);
  const ended = exited(wrap);
  const interruptedAt = performance.now();
  wrap.kill("SIGINT");
  const { code } = await ended;
  assert.equal(code, 130, "an interrupted command did not end by INT");
  assert.ok((performance.now() - interruptedAt) / 1000 < 5, "the command ran on after INT");
  await until(() => !groupAlive(pgid), 5000, "the end of the command's group");
});

test("US-DEV-08 (issue 2370): SIGKILL to heavy-lock.run.sh, which gives no trap, still stops the command's group within a few seconds", async () => {
  const dir = lockFolder();
  const pidFile = path.join(dir, "command.pid");
  const holder = owner();
  const wrap = startWrapper(holder.pid, `printf %s $$ > "$HEAVY_TEST_PIDFILE"; sleep 120`, {
    HEAVY_TEST_PIDFILE: pidFile,
  });
  const pgid = await commandGroup(pidFile);
  const ended = exited(wrap);
  const killedAt = performance.now();
  wrap.kill("SIGKILL");
  const { signal } = await ended;
  assert.equal(signal, "SIGKILL");
  await until(() => !groupAlive(pgid), 6000, "the end of the command's group");
  const seconds = (performance.now() - killedAt) / 1000;
  assert.ok(seconds < 6, `the group ended ${seconds.toFixed(2)} s after the kill`);
  assert.ok(processAlive(holder.pid), "the owner was stopped");
});

test("US-DEV-08 (issue 2370): when the owner ends, heavy-lock.run.sh stops the command's group and ends too", async () => {
  const dir = lockFolder();
  const pidFile = path.join(dir, "command.pid");
  const holder = owner();
  const wrap = startWrapper(holder.pid, `printf %s $$ > "$HEAVY_TEST_PIDFILE"; sleep 120`, {
    HEAVY_TEST_PIDFILE: pidFile,
  });
  const pgid = await commandGroup(pidFile);
  const ended = exited(wrap);
  holder.kill("SIGKILL");
  const { code } = await ended;
  assert.equal(code, 143);
  await until(() => !groupAlive(pgid), 6000, "the end of the command's group");
});

test("US-DEV-08 (issue 2370): a child of the command that outlives the command is stopped when the command ends", async () => {
  const dir = lockFolder();
  const pidFile = path.join(dir, "child.pid");
  const holder = owner();
  const wrap = startWrapper(
    holder.pid,
    `sleep 120 & printf %s $! > "$HEAVY_TEST_PIDFILE"; exit 0`,
    { HEAVY_TEST_PIDFILE: pidFile },
  );
  const { code } = await exited(wrap);
  assert.equal(code, 0);
  await until(() => pidFileReady(pidFile), 5000, "the child's pid file");
  const childPid = Number(readFileSync(pidFile, "utf8").trim());
  await until(
    () => !processAlive(childPid),
    5000,
    "the end of the child that outlived the command",
  );
});
