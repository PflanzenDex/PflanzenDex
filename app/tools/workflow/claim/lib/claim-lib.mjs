// Pure rules of the claim check (US-DEV-08): who works on which story, how a branch is named,
// which findings forbid a second claim. No I/O here; the clients live in claim-client.mjs.
import { EPIC_SCOPES } from "../../../../config/project/commitlint.config.js";

// Assumption (starting value, not measured): a claim without a commit for 48 hours counts as stale.
export const DEFAULT_STALE_HOURS = 48;

/** Label of generated report issues (US-DEV-11); such an issue can never be claimed. */
export const REPORT_LABEL = "report";

/** Label of an issue without a valid type and epic label (FR-DEV-10, set by the issue check); never claimable. */
export const TRIAGE_LABEL = "needs-triage";

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

/**
 * Branch type from the project field Typ: fix for Bug, chore for Enabler, else feat. The board holds the type, not
 * the issue; the labels `bug` / `enabler` count only for an issue that is not on the board yet.
 */
function branchType(issue) {
  if (issue.typ) return issue.typ === "Bug" ? "fix" : issue.typ === "Enabler" ? "chore" : "feat";
  const labels = (issue.labels ?? []).map((l) => l.name);
  return labels.includes("bug") ? "fix" : labels.includes("enabler") ? "chore" : "feat";
}

/** Branch naming rule: <type>/<story-id>-<slug>. */
export function branchName(issue) {
  return `${branchType(issue)}/${claimKey(issue)}-${slugOf(issue.title) || "work"}`;
}

const WORK_TYPES = ["Story", "Enabler"];

/** Open issues whose board item is a story or enabler of `release`, each with its board Typ. */
export function workItems(issues, items, release) {
  return issues.flatMap((issue) => {
    const item = items.find((i) => i.issue === issue.number);
    return item && WORK_TYPES.includes(item.typ) && item.release === release
      ? [{ ...issue, typ: item.typ }]
      : [];
  });
}

/** The first release in board order that still has open stories or enablers; null when none has. */
export function firstOpenRelease(order, issues, items) {
  return order.find((release) => workItems(issues, items, release).length > 0) ?? null;
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

/** What `make claim` prints for a refusal `e` (its findings and message): the triage hint, or the owner hint. */
export function refusalReport(number, { findings, message }) {
  if (findings.some((f) => f.kind === "triage"))
    return `claim refused for #${number}: the issue needs triage.\n${message}`;
  return `claim refused for #${number}: someone may already work on it.\n${message}\nAsk the owner, or let the claim go stale (make board) before taking over.`;
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
  // US-DEV-11: the pinned retro issue is rewritten by a workflow; it is a report, never a task.
  if ((issue.labels ?? []).some((l) => l.name === REPORT_LABEL)) {
    found.push({
      kind: "report",
      text: `issue #${issue.number} is a generated report (label "${REPORT_LABEL}"), not a work item`,
    });
  }
  if ((issue.labels ?? []).some((l) => l.name === TRIAGE_LABEL)) {
    found.push({
      kind: "triage",
      text: `issue #${issue.number} is labelled "${TRIAGE_LABEL}": it needs one type and one epic label first (FR-DEV-10)`,
    });
  }
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

/** A refused claim: every finding, each with its text (`make claim` prints them). */
export class ClaimRefused extends Error {
  constructor(findings) {
    super(findings.map((f) => `  - ${f.text}`).join("\n"));
    this.findings = findings;
  }
}

/** The claim rules over the data read for one issue (no I/O). Throws ClaimRefused with every finding. */
export function checkFree({ issue, prs, branches, number, login, allowPrior }) {
  if (issue.state !== "OPEN")
    throw new ClaimRefused([{ text: `issue #${number} is ${issue.state}` }]);
  // The caller's own assignment is a half claim of an earlier run: continue, do not refuse.
  const findings = findConflicts({ issue, prs, branches, allowPrior }).filter(
    (f) => !(f.kind === "assignee" && f.login === login),
  );
  const branch = branchName(issue);
  if (branches.includes(branch)) findings.push({ text: `branch origin/${branch} exists` });
  if (findings.length) throw new ClaimRefused(findings);
}
