import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import type { Ci, Lock, Snapshot, WorktreeRow } from "../types";

// Read-only status panel for the orchestrating session (US-DEV-08, issue 2376); runbook:
// docs/guides/operations/status-panel.md. Sources: `git worktree list`, the heavy-lock note in the git
// common dir (where tools/lint/heavy-lock.sh keeps it), and read-only `gh api user`, `gh pr list` and
// `gh issue list`. It writes nothing and reads no .env. Without gh, or signed out, it shows the local parts.

const PANE = "status-panel";
const REFRESH_MS = 45_000;
const LOCK_WARN_MIN = 20;
// gh by PATH first; the usual install folders for sessions started without a login shell.
const GH_CANDIDATES = ["gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"];

const snap = atom({ plugin: "status-panel", key: "snap" } as const, null, { shape: "snap-1" });

type $T = EngineInterface;

type CheckEntry = {
  name?: string;
  context?: string;
  status?: string;
  conclusion?: string | null;
  state?: string;
  startedAt?: string;
};

type PrJson = {
  number: number;
  title: string;
  headRefName: string;
  isDraft: boolean;
  labels: { name: string }[];
  statusCheckRollup: CheckEntry[] | null;
};

type Repo = { root: string; commonDir: string };

async function run($: $T, argv: string[], cwd?: string): Promise<string> {
  const r = await $.process.run(argv, { cwd, timeoutMs: 30_000 });
  if (r.exitCode !== 0) {
    throw new Error(`${argv[0]} exited ${r.exitCode}: ${r.stderr.trim().slice(0, 120)}`);
  }

  return r.stdout;
}

let ghBin: string | null = null;

// Runs gh read-only; remembers the first binary that answers.
async function gh($: $T, args: string[], cwd: string): Promise<string> {
  if (ghBin) return run($, [ghBin, ...args], cwd);
  let last: unknown = new Error("gh not found");
  for (const bin of GH_CANDIDATES) {
    try {
      const out = await run($, [bin, ...args], cwd);
      ghBin = bin;

      return out;
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

// The main checkout and the git common dir, both from git, never from a fixed path.
async function findRepo($: $T): Promise<Repo | null> {
  try {
    const out = await run($, ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"]);
    const commonDir = out.trim();
    const root = commonDir.endsWith("/.git") ? commonDir.slice(0, -5) : commonDir;

    return { root, commonDir };
  } catch {
    return null;
  }
}

// Newest ci-status check run of a PR head: pending while queued or running.
export function ciOf(rollup: CheckEntry[] | null): Ci {
  const runs = (rollup ?? []).filter((c) => (c.name ?? c.context) === "ci-status");
  if (runs.length === 0) return "none";
  const latest = runs.reduce((a, b) => ((b.startedAt ?? "") > (a.startedAt ?? "") ? b : a));
  const done = latest.status === undefined || latest.status === "COMPLETED";
  const verdict = (latest.conclusion ?? latest.state ?? "").toUpperCase();
  if (!done || verdict === "" || verdict === "PENDING" || verdict === "EXPECTED") return "pending";

  return verdict === "SUCCESS" ? "success" : "failure";
}

// heavy-job.owner holds one line: "<owner pid> <directory> <target> <UTC time>" (heavy-lock.sh).
export function parseNote(line: string): { pid: string; label: string; sinceMs: number } | null {
  const parts = line.trim().split(" ");
  if (parts.length < 4) return null;
  const pid = parts[0] ?? "";
  const time = parts[parts.length - 1] ?? "";
  const target = parts[parts.length - 2] ?? "";
  const dir = parts.slice(1, -2).join(" ");
  const sinceMs = Date.parse(time);
  if (!/^\d+$/.test(pid) || Number.isNaN(sinceMs)) return null;
  const where = dir.split("/").pop() ?? dir;

  return { pid, label: `${target} (${where})`, sinceMs };
}

async function isAlive($: $T, pid: string): Promise<boolean> {
  for (const argv of [
    ["kill", "-0", pid],
    ["ps", "-p", pid],
  ]) {
    try {
      const r = await $.process.run(argv, { timeoutMs: 5_000 });

      return r.exitCode === 0;
    } catch {
      // that tool is missing: try the next one
    }
  }

  return false;
}

async function readLock($: $T, repo: Repo): Promise<Lock> {
  let line = "";
  try {
    line = await $.fs.read(`${repo.commonDir}/heavy-job.owner`);
  } catch {
    return { isHeld: false };
  }
  const note = parseNote(line);
  // A note whose owner pid is dead does not count, as in heavy-lock.sh.
  if (!note || !(await isAlive($, note.pid))) return { isHeld: false };

  return { isHeld: true, label: note.label, sinceMs: note.sinceMs };
}

export function parseWorktrees(
  porcelain: string,
  root: string,
): { name: string; branch: string }[] {
  const prefix = `${root}/.worktrees/`;
  const rows: { name: string; branch: string }[] = [];
  for (const block of porcelain.split("\n\n")) {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    if (!path || !path.startsWith(prefix)) continue;
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? "(detached)";
    rows.push({ name: path.slice(prefix.length), branch });
  }

  return rows;
}

let login: string | null = null;

async function readGh($: $T, root: string) {
  // GraphQL `viewer` answers for a user and for the App pflanzendex-agent[bot]; `gh api user` is 403 for an App (#2556).
  if (!login)
    login =
      (
        await gh(
          $,
          ["api", "graphql", "-f", "query={ viewer { login } }", "--jq", ".data.viewer.login"],
          root,
        )
      ).trim() || null;
  if (!login) throw new Error("gh api graphql viewer gave no login");
  const prs = JSON.parse(
    await gh(
      $,
      [
        "pr",
        "list",
        "--state",
        "open",
        "--limit",
        "200",
        "--json",
        "number,title,headRefName,isDraft,labels,statusCheckRollup",
      ],
      root,
    ),
  ) as PrJson[];
  const issues = JSON.parse(
    await gh(
      $,
      [
        "issue",
        "list",
        "--state",
        "open",
        "--assignee",
        // Claims assign the responsible human, not the bot (#2580, d-161). The mod may run without `process`.
        (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
          ?.PFLANZENDEX_CLAIM_ASSIGNEE || login,
        "--limit",
        "500",
        "--json",
        "number",
      ],
      root,
    ),
  ) as { number: number }[];

  return { login, prs, mine: new Set(issues.map((i) => i.number)) };
}

async function collect($: $T): Promise<Snapshot> {
  const atMs = await $.clock.now();
  const empty: Snapshot = {
    atMs,
    noRepo: false,
    hasGh: false,
    login: null,
    errors: [],
    worktrees: [],
    lock: { isHeld: false },
    ownerMerge: [],
    claimDrafts: null,
  };
  const repo = await findRepo($);
  if (!repo) return { ...empty, noRepo: true };
  const errors: string[] = [];
  const [trees, lock, remote] = await Promise.all([
    run($, ["git", "worktree", "list", "--porcelain"], repo.root)
      .then((out) => parseWorktrees(out, repo.root))
      .catch((e: unknown) => (errors.push(`worktrees: ${String(e)}`), [])),
    readLock($, repo).catch(
      (e: unknown): Lock => (errors.push(`lock: ${String(e)}`), { isHeld: false }),
    ),
    // No gh, or not signed in: quietly local only.
    readGh($, repo.root).catch(() => null),
  ]);

  const byBranch = new Map((remote?.prs ?? []).map((p) => [p.headRefName, p]));
  const worktrees: WorktreeRow[] = trees.map((t) => {
    const pr = byBranch.get(t.branch);

    return {
      name: t.name,
      branch: t.branch,
      pr: pr?.number ?? null,
      isDraft: pr?.isDraft ?? false,
      ci: pr ? ciOf(pr.statusCheckRollup) : "none",
    };
  });
  if (!remote) return { ...empty, errors, worktrees, lock };
  const ownerMerge = remote.prs
    .filter((p) => p.labels.some((l) => l.name === "owner-merge"))
    .map((p) => ({ number: p.number, title: p.title }));
  // A `make claim` draft: an open draft PR whose branch names an issue assigned to me.
  const claimDrafts = remote.prs.filter((p) => {
    const n = /issue-(\d+)-/.exec(p.headRefName)?.[1];

    return p.isDraft && n !== undefined && remote.mine.has(Number(n));
  }).length;

  return {
    ...empty,
    hasGh: true,
    login: remote.login,
    errors,
    worktrees,
    lock,
    ownerMerge,
    claimDrafts,
  };
}

const CI_MARK: Record<Ci, string> = { pending: "…", success: "✓", failure: "✗", none: "-" };

function minutes(nowMs: number, sinceMs: number): number {
  return Math.max(0, Math.round((nowMs - sinceMs) / 60_000));
}

function lockText(s: Snapshot, nowMs: number): string {
  if (!s.lock.isHeld) return "free";
  const min = minutes(nowMs, s.lock.sinceMs);

  return `held by ${s.lock.label} for ${min} min${min > LOCK_WARN_MIN ? " (over 20 min!)" : ""}`;
}

function rowText(w: WorktreeRow): string {
  return `${CI_MARK[w.ci]} ${w.pr ? `#${w.pr}${w.isDraft ? " draft" : ""}` : "no PR"} ${w.name}`;
}

export function statusText(s: Snapshot, nowMs: number): string {
  if (s.noRepo) return "status-panel: not in a git checkout";
  const count = (ci: Ci) => s.worktrees.filter((w) => w.ci === ci).length;
  const min = s.lock.isHeld ? minutes(nowMs, s.lock.sinceMs) : 0;
  const parts = [
    s.worktrees.length === 0
      ? "no worktrees"
      : `wt ${s.worktrees.length} (${count("success")}✓ ${count("failure")}✗ ${count("pending")}…)`,
    s.lock.isHeld ? `lock ${s.lock.label} ${min}m${min > LOCK_WARN_MIN ? " !" : ""}` : "lock free",
  ];
  if (s.hasGh) parts.push(`owner-merge ${s.ownerMerge.length}`, `drafts ${s.claimDrafts ?? "?"}`);
  else parts.push("gh offline");
  if (s.errors.length > 0) parts.push(`${s.errors.length} error(s)`);

  return parts.join(" · ");
}

// The pane's content as plain lines, for the command's reply (surfaces that place no pane).
export function fullText(s: Snapshot, nowMs: number): string {
  if (s.noRepo) return "Not in a git checkout.";
  const lines = [
    `Worktrees (${s.worktrees.length}):`,
    ...(s.worktrees.length === 0 ? ["  no worktrees"] : s.worktrees.map((w) => `  ${rowText(w)}`)),
    `Heavy lock: ${lockText(s, nowMs)}`,
  ];
  if (s.hasGh) {
    lines.push(
      `owner-merge (${s.ownerMerge.length}):`,
      ...s.ownerMerge.map((p) => `  #${p.number} ${p.title}`),
      `Open claim drafts (${s.login}): ${s.claimDrafts ?? "unknown"}`,
    );
  } else {
    lines.push("gh not available or not signed in: local parts only.");
  }
  lines.push(...s.errors.map((e) => `error: ${e}`));

  return lines.join("\n");
}

let inFlight: Promise<void> | null = null;

// One refresh at a time; a caller during a refresh waits for that one.
async function refresh($: $T): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const s = await collect($);
    await update($, snap, () => s);
    $.ui.status(statusText(s, s.atMs));
  })();
  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "status-panel",
      description:
        "Open the status panel (worktrees, heavy lock, owner-merge, claims) and refresh it",
    });
    void $.ui.open({ id: PANE, title: "PflanzenDex" });
    void refresh($);
    $.clock.every(REFRESH_MS, () => void refresh($));

    return next(e);
  });

  on("command.run", { command: "status-panel" }, async ($) => {
    const placed = await $.ui.open({ id: PANE, title: "PflanzenDex" });
    await refresh($);
    const s = await read($, snap);

    return {
      text: `${placed.isPlaced ? "Panel open.\n" : ""}${s ? fullText(s, s.atMs) : "No data yet."}`,
    };
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e);
    const s = await read($, snap);
    if (!s) return <Text dimColor>Loading…</Text>;
    if (s.noRepo) return <Text dimColor>Not in a git checkout.</Text>;
    const now = await $.clock.now();
    const lockMin = s.lock.isHeld ? minutes(now, s.lock.sinceMs) : 0;
    const age = Math.round((now - s.atMs) / 1000);

    return (
      <Box flexDirection="column">
        <Text bold>Worktrees ({s.worktrees.length})</Text>
        {s.worktrees.length === 0 && <Text dimColor>no worktrees</Text>}
        {s.worktrees.map((w) => (
          <Text color={w.ci === "failure" ? "red" : w.ci === "success" ? "green" : undefined}>
            {rowText(w)}
          </Text>
        ))}
        <Text bold>Heavy lock</Text>
        <Text color={!s.lock.isHeld ? "green" : lockMin > LOCK_WARN_MIN ? "red" : "yellow"}>
          {lockText(s, now)}
        </Text>
        {s.hasGh ? (
          <Box flexDirection="column">
            <Text bold>Waiting for the owner: owner-merge ({s.ownerMerge.length})</Text>
            {s.ownerMerge.map((p) => (
              <Text>
                #{p.number} {p.title}
              </Text>
            ))}
            <Text bold>
              Open claim drafts ({s.login}): {s.claimDrafts ?? "unknown"}
            </Text>
          </Box>
        ) : (
          <Text dimColor>gh not available or not signed in: local parts only</Text>
        )}
        {s.errors.map((err) => (
          <Text color="red">{err}</Text>
        ))}
        <Text dimColor>
          updated {age}s ago · every {REFRESH_MS / 1000}s · /status-panel refreshes
        </Text>
      </Box>
    );
  });
};
