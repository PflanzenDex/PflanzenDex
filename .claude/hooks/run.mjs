#!/usr/bin/env node
// Entry point for all Claude Code hooks of this repo (US-QG-07, US-DEV-02).
// Usage from .claude/settings.json: node .claude/hooks/run.mjs <guard-edit|guard-bash|guard-read|after-edit|after-bash|stop|subagent-stop|subagent-push>
// A hook must never hang or break a session: every step has a time limit and unexpected errors end with exit 0.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  baselineGrows,
  isBaselineFile,
  LAYOUT_CONFIG,
  manifestEditGrowth,
  textAfter,
} from "./baseline-growth.mjs";
import { isManifestPath } from "../../app/tools/check/code/layout/layout-manifest.mjs";
import { bashGateWrite } from "./bash-writes.mjs";
import {
  APPLIED_FROM_DEV,
  changedPaths,
  loadFingerprint,
  matchingOriginDev,
  originDevBlobs,
  storeFingerprint,
  takeFingerprint,
} from "./gate-fingerprint.mjs";
import { CONFIRMATIONS_FILE, needsQuestion, PLAN_FILE } from "./gate-confirmations.mjs";
import { gateEditVerdict, isSubagent } from "./gate-guard.mjs";
import { appendDecision, LOG_FILE } from "./gate-log.mjs";
import { FINGERPRINT_FILE, KEY_FILE } from "./gate-names.mjs";
import { keyOf, MAC_SUFFIX, sealRead } from "./gate-seal.mjs";
import {
  asksBeforeEdit,
  ENV_READ_REASON,
  envReadRefusal,
  isCodePath,
  isMigrationFile,
  isSpecPath,
  judgeCommand,
  MIGRATION_REASON,
  prettierCanFormat,
  ranGates,
  recordWriteRefusal,
} from "./rules.mjs";
import {
  LOCK_BUSY_EXIT,
  LOCK_NAME,
  LOCK_WAIT_SECONDS,
  RUN_LIMIT_SECONDS,
  STAMP_NAME,
  hasGitFile,
  subagentStop,
} from "./subagent-gates.mjs";
import { subagentPush } from "./subagent-push.mjs";

const event = process.argv[2];
// A request that cannot be read is denied by guard-read (US-QG-07, issue 2354) and says nothing to subagent-push (issue 2371);
// every other event fails here as it always did.
let input = {};
let unreadable = false;
try {
  input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  if (input === null || typeof input !== "object")
    throw new SyntaxError("the request is not an object");
} catch (error) {
  if (event !== "guard-read" && event !== "subagent-push") throw error;
  unreadable = true;
}
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 20000,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
// Git's view of a folder: the top of its worktree, the common git dir that every worktree of one repository shares, and
// the folder with its links resolved (git reports resolved paths). Null outside a repository or when git fails (US-QG-07).
// One hook run asks about many paths of one repository, so each folder is asked once (issue 2554).
const repoCache = new Map();
function repoAt(folder) {
  if (!repoCache.has(folder)) repoCache.set(folder, repoAtFresh(folder));
  return repoCache.get(folder);
}
function repoAtFresh(folder) {
  try {
    const [toplevel, common] = execFileSync(
      "git",
      ["rev-parse", "--show-toplevel", "--git-common-dir"],
      {
        cwd: folder,
        encoding: "utf8",
        timeout: 3000,
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).split("\n");
    return {
      toplevel: fs.realpathSync(toplevel),
      common: fs.realpathSync(path.resolve(folder, common)),
      folder: fs.realpathSync(folder),
    };
  } catch {
    return null;
  }
}

// Whether git failed for a folder in a way that says nothing about the repository: a timeout or a broken git, not "not a git
// repository" (issue 2554, round 2). Such a folder has an unknown place, and a gate decision fails closed for it.
function gitUnanswered(folder) {
  try {
    execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: folder,
      timeout: 3000,
      stdio: ["ignore", "ignore", "pipe"],
    });
    return false;
  } catch (error) {
    return !/not a git repository/.test(String(error.stderr ?? ""));
  }
}

// The root that owns a file, and the file's path from that root (US-QG-07, FR-QG-17). A file in a worktree of this
// repository is judged by its path inside that worktree, whichever folder the session started in. Any other file keeps
// the path from `root`, which starts with ".." and so matches no pattern.
function locate(file) {
  const abs = path.resolve(root, file ?? "");
  const fromRoot = {
    root,
    file: path.relative(root, abs).split(path.sep).join("/"),
  };
  // A new file may sit in a folder that does not exist yet: git answers for the nearest folder that does.
  let folder = path.dirname(abs);
  while (!fs.existsSync(folder) && path.dirname(folder) !== folder) folder = path.dirname(folder);
  const session = repoAt(root);
  const owner = session && repoAt(folder);
  // Git did not answer for the folder of the file while the session is in a repository: the place is unknown, and a gate
  // decision for it fails closed (issue 2554, round 2).
  if (session && !owner && gitUnanswered(folder)) return { ...fromRoot, unknown: true };
  if (!owner || owner.common !== session.common) return fromRoot;
  const real = path.join(owner.folder, path.relative(folder, abs));
  return {
    root: owner.toplevel,
    file: path.relative(owner.toplevel, real).split(path.sep).join("/"),
  };
}

// The path with its links resolved: the nearest folder that exists is resolved, the rest is kept as written (US-QG-07).
function realpath(p) {
  const rest = [];
  let existing = p;
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) {
    rest.unshift(path.basename(existing));
    existing = path.dirname(existing);
  }
  return path.join(fs.realpathSync(existing), ...rest);
}

// The place a write reaches (US-QG-07): a symlink is followed, a dangling one too, because a Write creates the file it points to.
// Without this a link inside .claude/hooks would hide a file outside it from the record check.
function landingPlace(p, depth = 0) {
  let stat = null;
  try {
    stat = fs.lstatSync(p);
  } catch {
    // Not there: the path is judged as it is written.
  }
  if (stat?.isSymbolicLink() && depth < 16)
    return landingPlace(path.resolve(path.dirname(p), fs.readlinkSync(p)), depth + 1);
  return realpath(p);
}

// The names of a path as they are on disk: this disk is case-insensitive, so `MAKEFILE` is the file `Makefile` (issue 2554).
// The listings of the folders are read once per hook run.
const listings = new Map();
function canonicalCase(p) {
  const parts = path.resolve(p).split(path.sep).filter(Boolean);
  let current = path.sep;
  for (let i = 0; i < parts.length; i++) {
    if (!listings.has(current)) {
      try {
        listings.set(current, fs.readdirSync(current));
      } catch {
        listings.set(current, null);
      }
    }
    const names = listings.get(current);
    if (names === null) return path.join(current, ...parts.slice(i));
    const hit = names.includes(parts[i])
      ? parts[i]
      : names.find((n) => n.toLowerCase() === parts[i].toLowerCase());
    if (hit === undefined) return path.join(current, ...parts.slice(i));
    current = path.join(current, hit);
  }
  return current;
}

// Whether a path is a gate file (issue 2554, round 2): judged as written and with the case of the names on disk and the links
// followed. A place that git cannot answer for is a gate file (fail closed).
function gateAt(abs) {
  return [abs, landingPlace(canonicalCase(abs))].some((p) => {
    const place = locate(p);
    return place.unknown === true || asksBeforeEdit(place.file);
  });
}

// Whether a folder holds a gate file, at any depth (issue 2554): a folder that a command removes, moves or writes into is then
// refused. Links are not followed; the folders of dependencies are skipped; a folder too big to read in full holds one.
const WALK_LIMIT = 3000;
const THROWAWAY = new Set(["node_modules", ".git", "dist", "coverage", ".cache"]);
function gatesIn(abs) {
  const dir = landingPlace(canonicalCase(abs));
  let stat;
  try {
    stat = fs.statSync(dir);
  } catch {
    return false;
  }
  if (!stat.isDirectory()) return false;
  const place = locate(path.join(dir, "x"));
  if (place.unknown) return true;
  let seen = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!THROWAWAY.has(entry.name)) stack.push(child);
        continue;
      }
      if (++seen > WALK_LIMIT) return true;
      if (asksBeforeEdit(path.relative(place.root, child).split(path.sep).join("/"))) return true;
    }
  }
  return false;
}

// The text of a script that a command runs, for the Bash guard (issue 2554): undefined when the file is missing, null when it
// cannot be read or is too big, else the text.
const SCRIPT_LIMIT = 64 * 1024;
function readScript(abs) {
  try {
    const stat = fs.statSync(abs);
    if (!stat.isFile() || stat.size > SCRIPT_LIMIT) return null;
    return fs.readFileSync(abs, "utf8");
  } catch (error) {
    return error.code === "ENOENT" ? undefined : null;
  }
}

// Whether a file has a second name (a hard link) in a repository (issue 2554, round 2): a write through it reaches the other name.
function linked(abs) {
  try {
    const stat = fs.statSync(abs);
    return stat.isFile() && stat.nlink > 1 && repoAt(path.dirname(abs)) !== null;
  } catch {
    return false;
  }
}

// The gate files of the worktree at `toplevel`: the files git lists, tracked or not, that the gate rules judge (issue 2554).
const gateLists = new Map();
function gatePathsRel(toplevel) {
  if (!gateLists.has(toplevel)) {
    let listed = [];
    try {
      listed = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
        cwd: toplevel,
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .split("\n")
        .filter((f) => f !== "" && asksBeforeEdit(f));
    } catch {
      listed = [];
    }
    gateLists.set(toplevel, listed);
  }
  return gateLists.get(toplevel);
}

// The state of the gate files of the session's worktree (second layer, issue 2554): the stored state (null when missing or not
// verified), the state now, and the gate paths whose content differs. Null outside a repository.
// The worktrees of the repository of `folder` that git lists (the main checkout and those under .worktrees/), and the top of
// `folder` itself (round 3, issue 2554). Git failing throws: the callers block.
function worktreesOf(folder) {
  const repo = repoAt(folder);
  if (!repo) return [];
  const listed = run("git", ["worktree", "list", "--porcelain"], {
    cwd: repo.folder,
    timeout: 3000,
  })
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => realpath(line.slice("worktree ".length)));
  return [repo.toplevel, ...listed].filter((p) => fs.existsSync(p));
}

// The worktrees whose gate files the fingerprint covers: those of the Bash command's folder, and those of the session (round 3).
const foldersToWatch = () => [
  ...new Set([...worktreesOf(root), ...worktreesOf(input.cwd ?? root)]),
];

// The fingerprint state of each watched worktree (round 3, issue 2554): the stored state (null when missing or not verified), the
// state now, and the gate paths whose content differs, named from the session root. Any error throws: the callers block.
function fingerprintStates() {
  return foldersToWatch().map((folder) => {
    const repo = repoAt(folder);
    const spot = confirmationSpot(folder);
    if (!repo || !spot) throw new Error(`${folder} is not a worktree that git can read`);
    const key = keyOf(repo.common);
    const file = path.join(spot.dir, FINGERPRINT_FILE);
    const prev = loadFingerprint(file, key);
    const rels = gatePathsRel(folder);
    const next = takeFingerprint(folder, rels);
    const named = (p) => path.relative(realpath(root), path.join(folder, p)) || p;
    // Issue 2557 (d-148): a gate file equal to its blob in origin/dev is reviewed work brought in by a fast-forward, a merge or a
    // fresh worktree. It does not block and is logged as applied. A file that differs, a missing origin/dev or a git error blocks.
    // A worktree without a stored state (a fresh one) is verified only when all its gate files and those of origin/dev are equal.
    const candidates = prev === null ? null : changedPaths(prev, next);
    let unverified = prev === null;
    let changedRel = candidates ?? [];
    const applied = [];
    if (prev === null || changedRel.length > 0) {
      const fromDev = matchFromDev(folder, prev === null ? null : changedRel);
      if (prev === null) {
        if (fromDev?.all) {
          unverified = false;
          applied.push("(the stored state)");
        }
      } else if (fromDev) {
        applied.push(...changedRel.filter((rel) => fromDev.equal.has(rel)).map(named));
        changedRel = changedRel.filter((rel) => !fromDev.equal.has(rel));
      }
    }
    return { file, key, prev, next, changed: changedRel.map(named), applied, unverified };
  });
}

// Which gate files of `folder` equal their blob in origin/dev (issue 2557). With `rels` null, all gate files of the worktree and of
// origin/dev are compared and `all` says whether every one is equal. Null when origin/dev is missing or git fails (fail closed).
function matchFromDev(folder, rels) {
  try {
    const blobs = originDevBlobs(folder, asksBeforeEdit);
    const list = rels ?? [...new Set([...gatePathsRel(folder), ...Object.keys(blobs)])];
    const equal = matchingOriginDev(folder, list, blobs);
    return { equal, all: equal.size === list.length };
  } catch {
    return null;
  }
}

// Logs the gate files that origin/dev brought in (issue 2557).
function logApplied(states, source) {
  for (const file of states.flatMap((s) => s.applied))
    logGate(root, { file, decision: APPLIED_FROM_DEV, source, ...requester() });
}

// Stores the states as the baseline of the next check.
function storeStates(states) {
  for (const state of states) storeFingerprint(state.file, state.key, state.next);
}

const UNVERIFIED_BEFORE =
  "The stored state of the gate files cannot be verified, so this Bash command is refused. The state is stored again now; the next command is judged on it (US-QG-07, issue 2554, round 3).";
const UNVERIFIED_AFTER =
  "The stored state of the gate files cannot be verified, so the change of this Bash command is unknown. Stop and ask the owner to look; a subagent reports it to the ticket lead (US-QG-07, issue 2554).";
const refusedBeforeBash = (list) =>
  `Gate files changed outside the hook since the last check: ${list.join(", ")}. A background write, or a command that ran no after-bash check, did it. This command is refused; the owner looks, and the state is stored again (US-QG-07, issue 2554, round 3).`;
const checkBeforeFailed = (error) =>
  `The gate files could not be checked before this Bash command (${error.message.split("\n")[0]}), so the command is refused (US-QG-07, issue 2554, round 3).`;
const checkAfterFailed = (error) =>
  `The gate files could not be checked after this Bash command (${error.message.split("\n")[0]}). The next step stops: ask the owner to look (US-QG-07, issue 2554, round 3).`;

// Stores the state of the gate files now: the baseline of the next Bash command, or the state after an Edit (issue 2554).
function refreshFingerprint() {
  try {
    storeStates(fingerprintStates());
  } catch (error) {
    process.stderr.write(
      `hook: the gate fingerprint could not be stored (${error.message.split("\n")[0]})\n`,
    );
  }
}

// What the Bash guard needs to place a git command (US-QG-07, #1519): the folder the shell is in (the hook input's cwd,
// which the shell's cd moves), and the main checkout (the worktree whose .git is a directory) and the linked worktrees
// of the repository this hook runs in, as git lists them. Empty when git cannot tell: the guard then refuses reset and
// clean, because the place is not known.
function bashWhere() {
  try {
    const repo = repoAt(root);
    if (!repo) return {};
    const listed = run("git", ["worktree", "list", "--porcelain"], {
      cwd: repo.folder,
      timeout: 3000,
    })
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => realpath(line.slice("worktree ".length)));
    const isMain = (p) =>
      fs.existsSync(path.join(p, ".git")) && fs.statSync(path.join(p, ".git")).isDirectory();
    const main = listed.find(isMain);
    if (!main) return {};
    const isFolder = (p) => {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    };
    return {
      cwd: input.cwd ?? root,
      main,
      linked: listed.filter((p) => p !== main),
      isFolder,
      realpath,
    };
  } catch {
    return {};
  }
}

// Whether HEAD of the file's repository lacks the file, so it is a new migration (US-QG-07, US-DEV-07). An untracked or
// only staged file is missing from HEAD; an applied one is in it. `git ls-tree HEAD -- <file>` exits 0 and prints nothing
// for a missing path. `git cat-file -e HEAD:<file>` was the first choice, but it exits 128 for a missing path as well as
// for every git failure, so its exit status cannot tell the two apart. Any other failure (not a repository, no commit
// yet, git missing, timeout) gives no answer and counts as "in HEAD": the caller denies.
function notInHead(folder, file) {
  try {
    const listed = execFileSync("git", ["ls-tree", "HEAD", "--", file], {
      cwd: folder,
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return listed === "";
  } catch {
    // Fail closed: git did not say the file is missing.
    return false;
  }
}

// Where a worktree keeps its gate file records and which branch it is on: the git directory of the worktree (private to it,
// not tracked, not shared with the other worktrees) and the full ref of HEAD, null when HEAD is detached. Null when git
// cannot tell (US-QG-07).
function confirmationSpot(folder) {
  const gitOut = (args) =>
    execFileSync("git", args, {
      cwd: folder,
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  try {
    const dir = gitOut(["rev-parse", "--absolute-git-dir"]);
    let branch = null;
    try {
      branch = gitOut(["symbolic-ref", "-q", "HEAD"]) || null;
    } catch {
      // A detached HEAD: symbolic-ref exits 1, and there is no branch to key the record by.
    }
    return { dir, file: path.join(dir, CONFIRMATIONS_FILE), branch };
  } catch {
    return null;
  }
}

// The text of a record file of the git directory, or null when it is missing or cannot be read (US-QG-07).
function readRecord(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

// Whether an edit of this gate file asks the human: the branch of its worktree has not allowed the file (US-QG-07, issue 2554).
// Without a known place the file asks (fail closed).
function needsAskFor(folder, file) {
  const spot = confirmationSpot(folder);
  const repo = repoAt(folder);
  if (!spot || !repo) return true;
  // The allow counts only when its MAC verifies under the repository key (issue 2554, round 2): a forged record asks.
  return needsQuestion(file, spot.branch, sealRead(spot.file, keyOf(repo.common)));
}

// Who the hook answers, for the decision log: the subagent or the main session, the permission mode and the agent type (issue 2554).
const requester = () => ({
  actor: isSubagent(input) === true ? "subagent" : isSubagent(input) === false ? "main" : "unknown",
  mode: input.permission_mode ?? null,
  agent: input.agent_type ?? null,
});

// The verdict of a Bash command for the gate files (issue 2554). A check that cannot finish asks the owner and never passes.
function bashGateVerdict(command) {
  const subagent = isSubagent(input);
  try {
    const repo = repoAt(root);
    const gatePaths = repo
      ? gatePathsRel(repo.toplevel).map((f) => path.join(repo.toplevel, f))
      : [];
    // The folder is resolved like the gate paths of git, so a glob matches them (the temporary folders are links on macOS).
    return bashGateWrite(command, realpath(input.cwd ?? root), gateAt, {
      subagent,
      gatesIn,
      linked,
      gatePaths,
      readScript,
    });
  } catch {
    return {
      decision: subagent ? "deny" : "ask",
      file: null,
      reason:
        "This command could not be checked for writes to gate files (US-QG-07, issue 2554). Use the Edit tool for a gate file.",
    };
  }
}

// The reason of a Bash command that changed gate files (second layer, issue 2554): a subagent reverts and reports, the main
// session stops and the owner looks. A deny cannot undo a write, so the reason says what to do.
function gateChangeReason(files) {
  const list = files.join(", ");
  return isSubagent(input)
    ? `Gate files changed during this Bash command: ${list}. Subagents do not edit gate files: revert the change now and report it to the ticket lead, who asks the owner. A deny cannot undo a write (US-QG-07, issue 2554).`
    : `Gate files changed during this Bash command: ${list}. A shell wrote them outside the Edit tool, so no question reached the owner. Stop, and ask the owner to look before the next step (US-QG-07, issue 2554).`;
}

// The records of the gate files (US-QG-07, issue 2554). An edit of one of them asks the human: only the hook, make gate-plan
// and make gate-allow write them, and the plan allows nothing.
const RECORD_REASONS = {
  [CONFIRMATIONS_FILE]: `${CONFIRMATIONS_FILE} records which gate files the owner allowed. Only make gate-allow writes it (US-QG-07, issue 2554).`,
  [PLAN_FILE]: `${PLAN_FILE} lists the gate files a branch plans to change. Only make gate-plan writes it, and it allows nothing (US-QG-07).`,
  [LOG_FILE]: `${LOG_FILE} is the gate decision log. Only the hook writes it, and every line carries a MAC (US-QG-07, issue 2554).`,
  [KEY_FILE]: `${KEY_FILE} is the key of the hook records. Only the hook and the make targets read it (US-QG-07, issue 2554).`,
  [FINGERPRINT_FILE]: `${FINGERPRINT_FILE} is the stored state of the gate files. Only the hook writes it (US-QG-07, issue 2554).`,
};

// Appends one decision on a gate file to the log of the repository of `folder` (issue 2554). Without a repository there is no
// log, and nothing is written.
function logGate(folder, entry) {
  const repo = repoAt(folder);
  if (!repo) return;
  const branch = confirmationSpot(folder)?.branch ?? null;
  appendDecision(repo.common, { branch: branch && branch.replace(/^refs\/heads\//, ""), ...entry });
}

const print = (obj) => process.stdout.write(JSON.stringify(obj));
const preToolUse = (permissionDecision, permissionDecisionReason) =>
  print({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision,
      permissionDecisionReason,
    },
  });

// Fingerprint of all code changes relative to origin/dev (committed, staged, unstaged, untracked) in the worktree at `dir`:
// the session's root by default, the worktree of an implementer for the SubagentStop gate (US-QG-07).
function codeFingerprint(dir = root) {
  const git = (args) => run("git", args, { cwd: dir });
  const base = git(["merge-base", "HEAD", "origin/dev"]).trim();
  const changed = git(["diff", "--name-only", base]).split("\n");
  const untracked = git(["ls-files", "--others", "--exclude-standard"]).split("\n");
  const files = [...new Set([...changed, ...untracked])].filter((f) => f && isCodePath(f)).sort();
  if (files.length === 0) return null;
  const hash = createHash("sha256");
  for (const f of files)
    hash
      .update(f)
      .update(fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f)) : "deleted");
  return hash.digest("hex");
}

// `make gates` in a worktree (US-QG-07), one run at a time across the worktrees of this repository: flock on the lock in
// the common git directory. The lock path and the wait reach the shell as arguments, never as text of the script.
function runGates(worktree) {
  const started = Date.now();
  const common = path.resolve(
    worktree,
    run("git", ["rev-parse", "--git-common-dir"], {
      cwd: worktree,
      timeout: 3000,
    }).trim(),
  );
  const result = spawnSync(
    "bash",
    [
      "-c",
      'flock -E "$3" -w "$2" "$1" make gates 2>&1',
      "gates",
      path.join(common, LOCK_NAME),
      String(LOCK_WAIT_SECONDS),
      String(LOCK_BUSY_EXIT),
    ],
    {
      cwd: worktree,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: (LOCK_WAIT_SECONDS + RUN_LIMIT_SECONDS) * 1000,
    },
  );
  return {
    exit: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.error?.message ?? ""}`,
    durationMs: Date.now() - started,
  };
}
const stateFile = () =>
  path.join(run("git", ["rev-parse", "--absolute-git-dir"]).trim(), "claude-gates-fingerprint");

// Why an edit of a baseline grows it, or null when it only shrinks it (US-QG-07). The file on disk and the tool input
// give the resulting text; an edit that cannot be placed exactly counts as growth.
function baselineEditGrowth(fileRoot, file, toolInput) {
  const abs = path.join(fileRoot, file);
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  if (before === null) return "a new baseline file";
  const after = textAfter(toolInput, before);
  if (after === null) return "the edit cannot be placed exactly on the file";
  const { grows, reasons } = baselineGrows(file, before, after);
  return grows ? reasons.join("; ") : null;
}

// The new text of a Write, Edit, MultiEdit or NotebookEdit call: what the tool writes, not what it replaces (US-QG-07).
function newTexts(toolInput) {
  const edits = Array.isArray(toolInput.edits)
    ? toolInput.edits.map((edit) => edit?.new_string)
    : [];
  return [toolInput.content, toolInput.new_string, toolInput.new_source, ...edits].filter(
    (text) => typeof text === "string",
  );
}

// The text of a file of the working tree, null when it does not exist (US-QG-09).
function textOf(folder, file) {
  const abs = path.join(folder, file);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

// What the merge base with origin/dev holds of the layout config and of one README (US-QG-09, d-139): the texts that a limit
// carried over from a per-path rule is judged on. A text git cannot give is null, so a new manifest asks (fail closed).
function manifestBaseOf(folder, file) {
  const shown = (rev, name) => {
    try {
      return run("git", ["show", `${rev}:${name}`], { cwd: folder, timeout: 3000 });
    } catch {
      return null;
    }
  };
  try {
    const base = run("git", ["merge-base", "HEAD", "origin/dev"], {
      cwd: folder,
      timeout: 3000,
    }).trim();
    return { config: shown(base, LAYOUT_CONFIG), readme: shown(base, file) };
  } catch {
    return { config: null, readme: null };
  }
}

const handlers = {
  "guard-edit"() {
    const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
    const abs = path.resolve(root, target ?? "");
    const place = locate(target);
    const { root: fileRoot, file } = place;
    // A text that names a hook record is refused wherever the write lands outside .claude/hooks (US-QG-07).
    const reached = locate(landingPlace(path.resolve(root, target ?? ""))).file;
    const refusal = recordWriteRefusal(reached, newTexts(input.tool_input ?? {}));
    if (refusal) return preToolUse("deny", refusal);
    // An applied migration is immutable. A new one, not yet in HEAD, is filled in after `make migration` (US-DEV-07).
    const migration = isMigrationFile(file) && fs.existsSync(path.join(fileRoot, file));
    if (migration && !notInHead(fileRoot, file)) return preToolUse("deny", MIGRATION_REASON);
    // A file with a second name is refused (issue 2554, round 2): a write through the hard link reaches the other name too.
    if (!place.unknown && linked(abs))
      return preToolUse(
        "deny",
        `${file} has a second name (a hard link). A write through it reaches another file, which may be a gate file, so the edit is refused (US-QG-07, issue 2554).`,
      );
    const name = path.basename(target ?? "");
    const record = name.endsWith(MAC_SUFFIX) ? name.slice(0, -MAC_SUFFIX.length) : name;
    if (Object.hasOwn(RECORD_REASONS, record)) {
      // The records are denied for every actor and in every mode: an edit of one could allow gate files nobody was asked about,
      // or forge the log (US-QG-07, issue 2554, round 2).
      preToolUse("deny", RECORD_REASONS[record]);
      logGate(fileRoot, { file: record, decision: "deny", source: "guard-edit", ...requester() });
    } else if (place.unknown || gateAt(abs) || asksBeforeEdit(file)) {
      if (place.unknown)
        return preToolUse(
          "ask",
          `The place of ${file} is not known: git did not answer for its folder, so the edit is asked (US-QG-07, issue 2554).`,
        );
      // A gate test is not asked about (US-QG-07): it is a gate file for make merge only, and make merge reviews it there.
      // Every other gate file asks at every edit, a subagent is denied, and an automatic mode denies (issue 2554).
      const verdict = gateEditVerdict({
        subagent: isSubagent(input),
        mode: input.permission_mode,
        needsAsk: needsAskFor(fileRoot, file),
        file,
      });
      if (verdict) {
        preToolUse(verdict.decision, verdict.reason);
        logGate(fileRoot, {
          file,
          decision: verdict.decision,
          source: "guard-edit",
          ...requester(),
        });
      }
    } else if (isBaselineFile(file)) {
      let reason;
      try {
        reason = baselineEditGrowth(fileRoot, file, input.tool_input ?? {});
      } catch (e) {
        // Fail closed: a baseline that cannot be judged goes to a human.
        reason = `it could not be judged (${e.message.split("\n")[0]})`;
      }
      if (reason)
        preToolUse(
          "ask",
          `${file} is a baseline and this change grows it: ${reason}. A baseline may only shrink; growth needs a human (US-QG-07, FR-QG-17).`,
        );
    } else if (isManifestPath(file)) {
      // A layout manifest that adds or raises its expect is growth too (US-QG-09, d-138). The limit the merge base gave the
      // folder carries over (d-139), so the merge base is read as well.
      let reason;
      try {
        reason = manifestEditGrowth(
          file,
          textOf(fileRoot, file),
          input.tool_input ?? {},
          manifestBaseOf(fileRoot, file),
        );
      } catch (e) {
        // Fail closed: a manifest that cannot be judged goes to a human.
        reason = `it could not be judged (${e.message.split("\n")[0]})`;
      }
      if (reason)
        preToolUse(
          "ask",
          `${file} is a layout manifest and this change grows it: ${reason}. A folder holds more units only with a human's approval (US-QG-09, FR-QG-21).`,
        );
    }
  },
  "guard-bash"() {
    const command = input.tool_input?.command ?? "";
    // The state of the gate files before the command (issue 2554, second layer; round 3, d-146). A change since the last check
    // refuses this command, and so does a state that cannot be checked. The state moves on after the refusal is printed.
    let states;
    try {
      states = fingerprintStates();
    } catch (error) {
      logGate(root, {
        file: "(fingerprint error)",
        decision: "deny",
        source: "guard-bash",
        ...requester(),
      });
      return preToolUse("deny", checkBeforeFailed(error));
    }
    logApplied(states, "guard-bash");
    const unverified = states.some((s) => s.unverified);
    const drift = states.flatMap((s) => s.changed);
    if (unverified || drift.length > 0) {
      for (const file of drift)
        logGate(root, { file, decision: "blocked", source: "guard-bash", ...requester() });
      if (unverified)
        logGate(root, {
          file: "(the stored state)",
          decision: "blocked",
          source: "guard-bash",
          ...requester(),
        });
      preToolUse("deny", unverified ? UNVERIFIED_BEFORE : refusedBeforeBash(drift));
      try {
        storeStates(states);
      } catch (error) {
        process.stderr.write(
          `hook: the gate state could not be stored (${error.message.split("\n")[0]})\n`,
        );
      }
      return;
    }
    try {
      storeStates(states);
    } catch (error) {
      return preToolUse("deny", checkBeforeFailed(error));
    }
    // Git facts are read only for a command that names git, reset or clean; the rest of the commands cost nothing (US-QG-07).
    const where = /\bgit\b|\b(reset|clean)\b/.test(command) ? bashWhere() : {};
    const verdict = judgeCommand(command, where);
    // A Bash write to a gate file is judged too (issue 2554). Its deny wins over an ask of judgeCommand; a deny of judgeCommand
    // stands. Every decision of the gate check is logged, also one that an ask of judgeCommand outranks.
    const gate = verdict?.decision === "deny" ? null : bashGateVerdict(command);
    if (gate)
      logGate(input.cwd ?? root, {
        file: gate.file ?? "(not known)",
        decision: gate.decision,
        source: "guard-bash",
        ...requester(),
      });
    if (gate && (!verdict || (gate.decision === "deny" && verdict.decision !== "deny")))
      preToolUse(gate.decision, gate.reason);
    else if (verdict) preToolUse(verdict.decision, verdict.reason);
  },
  // Read and Grep never open a secret env file (US-QG-07, issue 2354): the path and the glob are judged, not the contents. A request
  // that cannot be judged is refused, never passed: an unreadable request, or a check that throws.
  "guard-read"() {
    let refusal;
    try {
      refusal = unreadable
        ? ENV_READ_REASON
        : envReadRefusal(input.tool_name, input.tool_input ?? {});
    } catch {
      refusal = ENV_READ_REASON;
    }
    if (refusal) preToolUse("deny", refusal);
  },
  "after-edit"() {
    const { root: fileRoot, file } = locate(input.tool_input?.file_path);
    // A gate file edit that went through is logged as applied: the owner's yes to its question is the only sign of it (issue 2554).
    // Nothing is recorded: an answer covers this one edit, and only make gate-allow allows a file for the branch (US-QG-07).
    if (asksBeforeEdit(file))
      logGate(fileRoot, { file, decision: "applied", source: "after-edit", ...requester() });
    if (prettierCanFormat(file))
      run("npx", ["--no-install", "prettier", "--write", "--log-level", "warn", file.slice(4)], {
        cwd: path.join(fileRoot, "app"),
      });
    if (isSpecPath(file)) {
      try {
        run("node", ["app/tools/check/docs/specs/check-specs.mjs"], {
          cwd: fileRoot,
        });
      } catch (e) {
        print({
          hookSpecificOutput: {
            hookEventName: "PostToolUse",
            additionalContext: `Spec check failed after editing ${file}:\n${e.stderr || e.stdout}`,
          },
        });
      }
    }
    // The edit is the owner's answer to its question: the state of the gate files moves on with it (issue 2554, second layer).
    refreshFingerprint();
  },
  "after-bash"() {
    // The second layer (issue 2554; round 3): every watched worktree is compared with the state stored before the command. A change,
    // an unverified state, or any error blocks the next step and is logged; none of them is silent. The state moves on after the block.
    let states;
    try {
      if (ranGates(input.tool_input?.command ?? ""))
        fs.writeFileSync(stateFile(), codeFingerprint() ?? "");
      states = fingerprintStates();
    } catch (error) {
      logGate(root, {
        file: "(fingerprint error)",
        decision: "blocked",
        source: "after-bash",
        ...requester(),
      });
      return print({ decision: "block", reason: checkAfterFailed(error) });
    }
    logApplied(states, "after-bash");
    const unverified = states.some((s) => s.unverified);
    const changed = states.flatMap((s) => s.changed);
    if (unverified || changed.length > 0) {
      for (const file of changed)
        logGate(root, { file, decision: "blocked", source: "after-bash", ...requester() });
      if (unverified)
        logGate(root, {
          file: "(the stored state)",
          decision: "blocked",
          source: "after-bash",
          ...requester(),
        });
      print({
        decision: "block",
        reason: unverified ? UNVERIFIED_AFTER : gateChangeReason(changed),
      });
    }
    try {
      storeStates(states);
    } catch (error) {
      logGate(root, {
        file: "(fingerprint error)",
        decision: "blocked",
        source: "after-bash",
        ...requester(),
      });
      print({ decision: "block", reason: checkAfterFailed(error) });
    }
  },
  stop() {
    const current = codeFingerprint();
    if (!current) return;
    const last = fs.existsSync(stateFile()) ? fs.readFileSync(stateFile(), "utf8") : "";
    if (current !== last) {
      print({
        systemMessage:
          "Heads-up: code changed since `make ci` or `make gates` last ran in this worktree. Run it before calling the work done (US-QG-07).",
      });
    }
  },
  // The SubagentStop gate of an implementer (US-QG-07): the worktree comes from the transcript, the git and process calls are here.
  "subagent-stop"() {
    const repo = repoAt(root);
    const out = subagentStop(input, {
      worktreesDir: repo && path.join(path.dirname(repo.common), ".worktrees"),
      isWorktree: hasGitFile,
      readFile: readRecord,
      writeFile: (file, text) => fs.writeFileSync(file, text),
      stampFile: (worktree) =>
        path.resolve(
          worktree,
          run("git", ["rev-parse", "--git-path", STAMP_NAME], {
            cwd: worktree,
            timeout: 3000,
          }).trim(),
        ),
      head: (worktree) =>
        run("git", ["rev-parse", "HEAD"], {
          cwd: worktree,
          timeout: 3000,
        }).trim(),
      fingerprint: (worktree) => codeFingerprint(worktree),
      runGates,
      now: () => new Date().toISOString(),
    });
    if (out) print(out);
  },
  // The push check of an implementer or a ticket lead (US-QG-07, issue 2371): read-only git calls, never a block. A check that
  // cannot run says nothing, so a hook error never reaches the stop.
  "subagent-push"() {
    try {
      const repo = repoAt(root);
      const out = subagentPush(input, {
        worktreesDir: repo && path.join(path.dirname(repo.common), ".worktrees"),
        isWorktree: hasGitFile,
        readFile: readRecord,
        branchOf: (worktree) => {
          const ref = run("git", ["symbolic-ref", "-q", "HEAD"], {
            cwd: worktree,
            timeout: 3000,
          }).trim();
          return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : null;
        },
        remoteHead: (worktree, branch) =>
          run("git", ["rev-parse", "--verify", "-q", `refs/remotes/origin/${branch}`], {
            cwd: worktree,
            timeout: 3000,
          }).trim(),
        reflogText: (worktree, branch) =>
          run(
            "git",
            ["log", "-g", "--date=unix", "--format=%H %gD", `refs/remotes/origin/${branch}`, "--"],
            { cwd: worktree, timeout: 3000 },
          ),
      });
      if (out) print(out);
    } catch {
      // Silent by design: an error in this check must never break a stop (US-QG-07).
    }
  },
};

try {
  handlers[event]?.();
} catch (e) {
  // Never block the session because of a hook bug; report it on stderr (shown as a non-blocking hook error).
  process.stderr.write(`hook ${event}: ${e.message.split("\n")[0]}\n`);
}
