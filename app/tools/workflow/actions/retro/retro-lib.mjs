// Pure rules of the issue flow retro (US-DEV-11): created vs. closed issues per day and their averages, the process
// share of the merged pull requests (E-30) and the implementer rework. No I/O here; retro-render.mjs writes the Markdown,
// retro.mjs fetches the issues and pull requests and writes the body.
import { REPORT_LABEL } from "../../claim/lib/claim-lib.mjs";

export { REPORT_LABEL };
export const REPORT_TITLE = "Retro: Issue flow";
export const TZ = "Europe/Berlin";
const RECENT_DAYS = 7;
const SHORT_DAYS = 7;
/** The long window of the process share and of the implementer rework: 28 full days (US-DEV-11). */
export const LONG_DAYS = 28;
/** Conventional-Commit scopes of process work (E-30): the development process, the gates and CI. */
const PROCESS_SCOPES = new Set(["dev", "qg", "ci"]);
const PROCESS_SCOPE = /^\w+\(([^)]+)\)!?:/;
/** Kinds of a pull request in the rework table; the order is the tie order (US-DEV-11). */
export const KINDS = ["UI/layout", "core/API", "tooling/gates", "docs", "other"];
const TOOLING = ["app/tools/", "tools/", ".github/", ".claude/"];
/** The attribution trailer of the implementer agent (.claude/agents/implementer.md). */
const TRAILER = /^Implementer: \S+/m;
/** Scheduled and manual runs compute the implementer rework; the others keep it from the report body (US-DEV-11). */
const REWORK_EVENTS = new Set(["schedule", "workflow_dispatch"]);

const dayKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar day (YYYY-MM-DD) of a timestamp in Europe/Berlin. */
export const dayOf = (t) => dayKey.format(new Date(t));

/** Issues only: no pull requests (the REST issues list returns both) and no report issues. */
export function countable(issue) {
  if (issue.pull_request) return false;
  return !(issue.labels ?? []).some((l) => (typeof l === "string" ? l : l.name) === REPORT_LABEL);
}

const pad = (n) => String(n).padStart(2, "0");

/** The calendar day `n` days after a YYYY-MM-DD key (before, when negative); pure calendar arithmetic, no time zone involved. */
const shiftDay = (day, n) => {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

const nextDay = (day) => shiftDay(day, 1);

/** First day of the last `days` full days before `today` (today itself is not a full day). */
export const windowStart = (today, days) => shiftDay(today, -days);

/** Whether a day lies in the last `days` full days before `today`. */
export const inFullDays = (day, today, days) => day >= windowStart(today, days) && day < today;

/** One row per day from the first created issue up to `today`: created, closed, open at the end of the day. */
export function dailyFlow(issues, today) {
  const created = new Map();
  const closed = new Map();
  const bump = (map, t) => map.set(dayOf(t), (map.get(dayOf(t)) ?? 0) + 1);
  for (const i of issues) {
    bump(created, i.created_at);
    if (i.closed_at) bump(closed, i.closed_at);
  }
  if (!created.size) return [];
  const rows = [];
  let open = 0;
  for (let day = [...created.keys()].sort()[0]; day <= today; day = nextDay(day)) {
    const row = { day, created: created.get(day) ?? 0, closed: closed.get(day) ?? 0 };
    open += row.created - row.closed;
    rows.push({ ...row, open });
  }
  return rows;
}

const mean = (rows) => {
  const created = rows.reduce((a, r) => a + r.created, 0) / rows.length;
  const closed = rows.reduce((a, r) => a + r.closed, 0) / rows.length;
  return {
    days: rows.length,
    from: rows[0].day,
    to: rows.at(-1).day,
    created,
    closed,
    net: created - closed,
  };
};

/** Averages over full days: the kickoff day (initial bulk of tickets) and today (not over) are left out. */
export function averages(days) {
  const full = days.slice(1, -1);
  if (full.length < 2) return null;
  return { all: mean(full), last7: mean(full.slice(-RECENT_DAYS)) };
}

/** Process scope of a pull request title (E-30): `dev`, `qg` or `ci`. A `docs:` title without a scope is not process work. */
export function isProcessTitle(title) {
  const scope = PROCESS_SCOPE.exec(title)?.[1];
  return scope !== undefined && PROCESS_SCOPES.has(scope);
}

/**
 * Merged pull requests into `dev` and how many of them are process work, for the last 7 and the last 28 full days (E-30).
 * `pulls` are pull requests as the REST list gives them; only those with `merged_at` count, by the Berlin day of the merge.
 */
export function processShare(pulls, today) {
  const merged = pulls.filter((p) => p.merged_at);
  return [SHORT_DAYS, LONG_DAYS].map((days) => {
    const recent = merged.filter((p) => inFullDays(dayOf(p.merged_at), today, days));
    const processPrs = recent.filter((p) => isProcessTitle(p.title)).length;
    return {
      days,
      merged: recent.length,
      process: processPrs,
      share: recent.length ? processPrs / recent.length : null,
    };
  });
}

const isClaim = (message) => message.startsWith("chore(dev): claim issue-");
const isMerge = (c) => c.parents > 1 || c.message.startsWith("Merge ");
const isImplementer = (c) => TRAILER.test(c.message);

/**
 * Rework of one merged pull request (US-DEV-11). `commits` are its commits, oldest first, as `{ message, parents }` where
 * parents is the number of parent commits. The claim commit and merge commits are left out. Rework is a commit without the
 * `Implementer:` trailer that comes after the first implementer commit. A pull request without an implementer commit is not
 * counted: null.
 */
export function reworkOf(commits) {
  const counted = commits.filter((c) => !isClaim(c.message) && !isMerge(c));
  const first = counted.findIndex(isImplementer);
  if (first < 0) return null;
  return { rework: counted.slice(first + 1).filter((c) => !isImplementer(c)).length };
}

/** Kind of one changed file; "other" when no kind names its path. */
function fileKind(file) {
  if (file.startsWith("app/packages/web/")) return "UI/layout";
  if (file.startsWith("app/packages/core/") || file.startsWith("app/packages/api/"))
    return "core/API";
  if (TOOLING.some((p) => file.startsWith(p)) || file === "Makefile") return "tooling/gates";
  if (file.startsWith("docs/") || file.endsWith(".md")) return "docs";
  return "other";
}

/** Kind of a pull request from its changed files: the kind with the most files; ties go to the kind listed first in KINDS. */
export function kindOf(files) {
  if (!files.length) return "other";
  const count = new Map(KINDS.map((k) => [k, 0]));
  for (const f of files) count.set(fileKind(f), count.get(fileKind(f)) + 1);
  return KINDS.reduce((best, k) => (count.get(k) > count.get(best) ? k : best));
}

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** One row of the rework table: the pull requests of one kind (or of all of them, the total). */
function summarize(kind, prs) {
  const withRework = prs.filter((p) => p.rework > 0).length;
  return {
    kind,
    prs: prs.length,
    withRework,
    share: prs.length ? withRework / prs.length : null,
    median: median(prs.map((p) => p.rework)),
  };
}

/**
 * Rework table (US-DEV-11): one row per kind that has counted pull requests, in KINDS order, then the total row.
 * `counted` holds `{ kind, rework }` for each merged pull request with an implementer commit (reworkOf is not null).
 */
export function reworkByKind(counted) {
  const kinds = KINDS.filter((k) => counted.some((p) => p.kind === k)).map((k) =>
    summarize(
      k,
      counted.filter((p) => p.kind === k),
    ),
  );
  return [...kinds, { ...summarize("Total", counted), total: true }];
}

/** Whether this run computes the implementer rework: a scheduled or manual run (RETRO_EVENT), or the flag --rework. */
export function reworkRequested(argv, env) {
  return argv.includes("--rework") || REWORK_EVENTS.has(env.RETRO_EVENT);
}
