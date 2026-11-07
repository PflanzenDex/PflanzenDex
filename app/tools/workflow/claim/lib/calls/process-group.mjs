// The process handling of the claim tools' calls (US-DEV-08, #1559): how a gh or git command runs, with a time limit or without one.
// A call with a limit runs in a process group of its own. A timeout ends the whole group (SIGTERM, SIGKILL only when a process
// survives the grace time), and so does a Ctrl+C or a closed terminal in the claim, so no process of a gate run is left behind.
import { spawn } from "node:child_process";
import os from "node:os";

const MAX_OUTPUT = 32 * 1024 * 1024; // as the maxBuffer of the earlier execFile transport
export const KILL_GRACE_MS = 5000; // assumption: a starting value; how long a process group may take to end after SIGTERM
const POLL_MS = 50;

/** A call that ran past its time limit. Its process group has ended when this is thrown; `limitMs` is the limit it had. */
export class CallTimeout extends Error {
  constructor(cmd, args, limitMs) {
    super(
      `${cmd} ${args.slice(0, 2).join(" ")} did not answer within ${limitMs / 1000} s (network or GitHub too slow); run it again`,
    );
    this.name = "CallTimeout";
    this.limitMs = limitMs;
  }
}

const groups = new Set(); // the process groups (leader pid) of the calls with a limit that run now
let forwarding = false;

/**
 * Runs one command and resolves its stdout, as execFile did: a failed command rejects with "Command failed: <command>" and its
 * stderr. With a limit the command leads a process group of its own (see endGroup); without one it runs as before.
 */
export function runCommand(cmd, args, { cwd, limitMs, killGraceMs }) {
  const label = [cmd, ...args].join(" ");
  const limited = Boolean(limitMs); // as before: no limit, or 0, runs without a group and without a timer
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, detached: limited, stdio: ["pipe", "pipe", "pipe"] });
    const out = [];
    const err = [];
    let size = 0;
    let overflow; // the error once the output passes MAX_OUTPUT
    let ending = false; // a limited call ends its group first: its close does not settle the call then
    let settled = false;
    let timer;
    const settle = (error, stdout) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      groups.delete(child.pid);
      if (error) reject(error);
      else resolve(stdout);
    };
    const endLimited = (error) => {
      ending = true;
      endGroup(child.pid, killGraceMs).then(() => settle(error), settle);
    };
    const collect = (chunks) => (chunk) => {
      size += chunk.length;
      if (size <= MAX_OUTPUT) {
        chunks.push(chunk);
      } else if (!overflow) {
        overflow = new Error(`${label}: output larger than 32 MiB`);
        if (limited) endLimited(overflow);
        else child.kill();
      }
    };
    if (limited && child.pid !== undefined) {
      groups.add(child.pid);
      forwardEnds();
      timer = setTimeout(() => {
        if (!ending) endLimited(new CallTimeout(cmd, args, limitMs));
      }, limitMs);
    }
    child.stdout.on("data", collect(out));
    child.stderr.on("data", collect(err));
    child.on("error", (error) => settle(error));
    child.on("close", (code) => {
      if (ending) return;
      if (overflow) return settle(overflow);
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (code === 0) return settle(null, stdout);
      return settle(
        Object.assign(new Error(`Command failed: ${label}\n${stderr}`), { code, stdout, stderr }),
      );
    });
  });
}

/** Sends `signal` to the process group `pid`; a group that is gone already is no error. */
function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (e) {
    if (e.code !== "ESRCH") throw e;
  }
}

/** True while a process of the group `pid` is alive. */
function groupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

async function waitGroupGone(pid, ms) {
  const until = Date.now() + ms;
  while (groupAlive(pid) && Date.now() < until) await new Promise((r) => setTimeout(r, POLL_MS));
  return !groupAlive(pid);
}

/**
 * Ends a process group: SIGTERM first, SIGKILL only when a process of the group survives the grace time (#1559). Resolves when
 * the group is gone, so a rollback that runs after it never meets a gate run of the timed-out call.
 */
async function endGroup(pid, graceMs) {
  signalGroup(pid, "SIGTERM");
  if (await waitGroupGone(pid, graceMs)) return;
  signalGroup(pid, "SIGKILL");
  await waitGroupGone(pid, graceMs);
}

/**
 * A call with a limit runs in a session of its own, so a Ctrl+C or a closed terminal would not reach it. The claim ends its groups
 * itself when it is interrupted or exits (#1559); the first call with a limit installs this, once per process.
 */
function forwardEnds() {
  if (forwarding) return;
  forwarding = true;
  process.once("exit", () => {
    for (const pid of groups) signalGroup(pid, "SIGTERM");
  });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.once(signal, () => {
      const exit = () => process.exit(128 + os.constants.signals[signal]);
      Promise.all([...groups].map((pid) => endGroup(pid, KILL_GRACE_MS))).then(exit, exit);
    });
  }
}
