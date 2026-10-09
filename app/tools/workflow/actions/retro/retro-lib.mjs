// Pure rules of the issue flow retro (US-DEV-11): created vs. closed issues per day and their averages.
// No I/O here; retro-render.mjs writes the Markdown, retro.mjs fetches the issues and writes the body.
import { REPORT_LABEL } from "../../claim/lib/claim-lib.mjs";

export { REPORT_LABEL };
export const REPORT_TITLE = "Retro: Issue flow";
export const TZ = "Europe/Berlin";
const RECENT_DAYS = 7;

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

/** Next calendar day of a YYYY-MM-DD key; pure calendar arithmetic, no time zone involved. */
const nextDay = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  const n = new Date(Date.UTC(y, m - 1, d + 1));
  return `${n.getUTCFullYear()}-${pad(n.getUTCMonth() + 1)}-${pad(n.getUTCDate())}`;
};

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
