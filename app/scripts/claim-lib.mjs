// Pure rules of the claim check (US-DEV-08): who works on which story, how a branch is named,
// which findings forbid a second claim. No I/O here; the clients live in claim-client.mjs.
import { EPIC_SCOPES } from "../commitlint.config.js";

// Assumption (starting value, not measured): a claim without a commit for 48 hours counts as stale.
export const DEFAULT_STALE_HOURS = 48;

const ID_PATTERN = /\b(US-[A-Z]{2,4}-\d{2}|FR-[A-Z]{2,4}-\d{2}|TE-\d{2})\b/i;
const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b/gi;
const UMLAUTS = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

/** Story ID such as "US-DEV-08" from a title or branch text, or null. */
export function storyIdOf(text) {
  const m = ID_PATTERN.exec(text ?? "");
  return m ? m[1].toUpperCase() : null;
}

/** Search key for branch and PR matching: the story ID without US-/FR- and in lower case (wac-01, as in
 * feat/wac-01-messung), or issue-<n> without an ID. FR-WAC-01 and US-WAC-01 share a key on purpose. */
export function claimKey(issue) {
  const id = storyIdOf(issue.title);
  return id ? id.toLowerCase().replace(/^(us|fr)-/, "") : `issue-${issue.number}`;
}

/** Claim key of a branch name such as feat/wac-01-messung or chore/issue-243-x, or null. */
export function keyOfBranch(branch) {
  const m = /(?:^|\/)(?:us-|fr-)?([a-z]{2,4}-\d{2}|issue-\d+)(?=-|$)/i.exec(branch ?? "");
  return m ? m[1].toLowerCase() : null;
}

export function hasKey(text, key) {
  const hay = (text ?? "").toLowerCase();
  const isWord = (c) => c !== undefined && /[a-z0-9]/.test(c);
  for (let i = hay.indexOf(key); i !== -1; i = hay.indexOf(key, i + 1)) {
    if (!isWord(hay[i - 1]) && !isWord(hay[i + key.length])) return true;
  }
  return false;
}

export function slugOf(title) {
  const words = title
    .replace(ID_PATTERN, "")
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c])
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let slug = "";
  for (const word of words.slice(0, 4)) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > 30) break;
    slug = next;
  }
  return slug || (words[0] ?? "").slice(0, 30);
}

/** Branch naming rule: <type>/<story-id>-<slug>; type fix for label bug, chore for enabler, else feat. */
export function branchName(issue) {
  const labels = (issue.labels ?? []).map((l) => l.name);
  const type = labels.includes("bug") ? "fix" : labels.includes("enabler") ? "chore" : "feat";
  return `${type}/${claimKey(issue)}-${slugOf(issue.title) || "work"}`;
}

/** Conventional Commits scope: the epic of the story ID, "dev" when there is none. */
export function scopeOf(issue) {
  const epic = storyIdOf(issue.title)?.split("-")[1]?.toLowerCase();
  return EPIC_SCOPES.includes(epic) ? epic : "dev";
}

/**
 * Whether a PR belongs to the issue. A closing keyword ("Closes #n") in the body is the link for every PR. A story
 * key in title or branch counts for open PRs only (live work that skipped the keyword): a merged PR that merely
 * mentions the key (a part of a bigger story) must not make the story look taken (#393).
 */
export function prReferences(pr, issue) {
  const closes = [...(pr.body ?? "").matchAll(CLOSING)].some((m) => Number(m[1]) === issue.number);
  if (closes) return true;
  const key = claimKey(issue);
  return prState(pr) === "open" && (hasKey(pr.title, key) || hasKey(pr.headRefName, key));
}

export function prState(pr) {
  return pr.mergedAt || pr.state === "MERGED" ? "merged" : pr.state === "OPEN" ? "open" : "closed";
}

/**
 * All reasons why `issue` must not be claimed (empty list: free). Each finding names where to look.
 * allowPrior waives merged PRs only (a story may need a follow-up PR); never open work.
 */
export function findConflicts({ issue, prs, branches, allowPrior = false }) {
  const key = claimKey(issue);
  const found = [];
  for (const a of issue.assignees ?? []) {
    found.push({
      kind: "assignee",
      login: a.login,
      text: `issue #${issue.number} is assigned to @${a.login}`,
    });
  }
  for (const pr of prs.filter((p) => prReferences(p, issue))) {
    const state = prState(pr);
    if (state === "closed" || (state === "merged" && allowPrior)) continue;
    found.push({ kind: "pr", text: `PR #${pr.number} (${state}) references it: ${pr.title}` });
  }
  for (const b of branches.filter((name) => hasKey(name, key))) {
    found.push({ kind: "branch", text: `branch origin/${b} already carries ${key}` });
  }
  return found;
}

export function ageHours(iso, now) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 3_600_000));
}

export function staleHoursFrom(env) {
  const n = Number(env.CLAIM_STALE_HOURS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STALE_HOURS;
}
