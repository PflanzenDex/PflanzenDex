// Guarded merge for agents (ADR 0005): `make merge PR=<n>`. Merges a pull request into `dev` with a squash merge
// only if every condition holds; otherwise it names the failed ones and leaves the merge to a human.
//   1. the PR is open, not a draft, and targets `dev` (never `main`: a release stays a human decision)
//   2. the newest `ci-status` run on the PR head commit is green (older, cancelled runs do not count)
//   3. the PR names a story or requirement (US-/FR-/DM-/NFR-) that exists in docs/specs/product (the spec is written)
//   4. the PR changes no gate file (workflows, rulesets, hooks, thresholds, `.claude/`, this script): a human decides
//   5. the PR grows no baseline (app/config/gates/baselines/, US-QG-07): the merge base and the head are compared; a
//      baseline that only shrinks merges, and a version that cannot be read refuses the PR
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { baselineChanges, baselineProblems } from "../../../.claude/hooks/baseline-growth.mjs";
import { isGateFile } from "../../../.claude/hooks/rules.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ID = /\b(?:US|FR|DM)-[A-Z]+-\d+\b|\bNFR-\d+\b/g;

/** Story and requirement IDs named in a text. */
export const idsIn = (text) => [...new Set(text.match(ID) ?? [])];

/** IDs that the product specs define (heading `### US-…` or table row `| FR-… |`). */
export function specIds(specDir) {
  const known = new Set();
  for (const f of readdirSync(specDir).filter((n) => n.endsWith(".md"))) {
    for (const line of readFileSync(join(specDir, f), "utf8").split("\n")) {
      const head = /^(?:#{2,4}\s+|\|\s*\*{0,2})((?:US|FR|DM)-[A-Z]+-\d+|NFR-\d+)\b/.exec(line);
      if (head) known.add(head[1]);
    }
  }
  return known;
}

/**
 * The newest run of a check on the PR head commit. The rollup lists every run, so a re-run after a cancelled
 * run yields two entries; the one that started last decides. On a tie the stricter (non-success) entry wins.
 */
export function latestCheck(rollup, name) {
  const started = (c) => Date.parse(c.startedAt ?? c.completedAt ?? "") || 0;
  const success = (c) => (c.conclusion ?? c.state) === "SUCCESS";
  let latest;
  for (const c of rollup ?? []) {
    if ((c.name ?? c.context) !== name) continue;
    if (
      !latest ||
      started(c) > started(latest) ||
      (started(c) === started(latest) && success(latest) && !success(c))
    )
      latest = c;
  }
  return latest;
}

/** Problems that stop an agent from merging; empty means allowed. `pr` is the JSON of `gh pr view`. */
export function problems(pr, known, changes = []) {
  const out = [];
  if (pr.state !== "OPEN") out.push(`the PR is ${pr.state}, not open`);
  if (pr.isDraft) out.push("the PR is a draft");
  if (pr.baseRefName !== "dev")
    out.push(`the base is \`${pr.baseRefName}\`; agents merge into \`dev\` only`);
  const ci = latestCheck(pr.statusCheckRollup, "ci-status");
  if (!ci) out.push("`ci-status` has not reported yet");
  else if ((ci.conclusion ?? ci.state) !== "SUCCESS")
    out.push(
      `\`ci-status\` is ${ci.conclusion || ci.state || ci.status || "unknown"}, not SUCCESS`,
    );
  const ids = idsIn(`${pr.title}\n${pr.body ?? ""}`);
  if (!ids.some((id) => known.has(id)))
    out.push(
      "the PR names no story or requirement that exists in docs/specs/product (no spec, no merge)",
    );
  const gates = (pr.files ?? []).map((f) => f.path).filter(isGateFile);
  if (gates.length)
    out.push(`it changes gate files, which a human must merge: ${gates.join(", ")}`);
  out.push(...baselineProblems(changes));
  return out;
}

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" });

/** The merge base of the PR's base and head commits (the diff the PR shows). */
const mergeBaseOf = (pr) =>
  gh(
    "api",
    `repos/{owner}/{repo}/compare/${pr.baseRefOid}...${pr.headRefOid}`,
    "--jq",
    ".merge_base_commit.sha",
  ).trim();

/** A file's text at a commit on GitHub; null when the file is absent there (HTTP 404); other failures throw. */
function readAt(sha, file) {
  const result = spawnSync(
    "gh",
    [
      "api",
      "-H",
      "Accept: application/vnd.github.raw",
      `repos/{owner}/{repo}/contents/${file}?ref=${sha}`,
    ],
    { encoding: "utf8" },
  );
  if (result.status === 0) return result.stdout;
  if (/HTTP 404/.test(result.stderr ?? "")) return null;
  throw new Error(
    (result.stderr || result.error?.message || `gh exited with ${result.status}`)
      .trim()
      .split("\n")[0],
  );
}

/**
 * Whether the code at `sha` still names the file's name outside the baseline folder, that is a gate that reads it.
 * An unclear answer (for example a commit this clone does not have) counts as named, so the deletion is growth.
 */
function namedAt(sha, file) {
  const name = file.split("/").pop();
  const result = spawnSync(
    "git",
    [
      "grep",
      "-l",
      "-F",
      "-e",
      name,
      sha,
      "--",
      "app",
      "tools",
      ".claude",
      ".github",
      "Makefile",
      ":(exclude)app/config/gates/baselines",
    ],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  return result.status !== 1;
}

function main(number) {
  if (!/^\d+$/.test(number ?? "")) {
    console.error("usage: make merge PR=<number>");
    return 2;
  }
  const fields =
    "state,isDraft,baseRefName,baseRefOid,headRefOid,title,body,files,statusCheckRollup";
  const pr = JSON.parse(gh("pr", "view", number, "--json", fields));
  const changes = baselineChanges(pr, {
    mergeBase: () => mergeBaseOf(pr),
    readAt,
    namedAtHead: (file) => namedAt(pr.headRefOid, file),
  });
  const found = problems(pr, specIds(join(REPO_ROOT, "docs", "specs", "product")), changes);
  if (found.length) {
    console.error(
      `merge-pr: PR #${number} is not merged:\n${found.map((p) => `  - ${p}`).join("\n")}`,
    );
    return 1;
  }
  gh("pr", "merge", number, "--squash", "--delete-branch");
  console.log(`merge-pr: PR #${number} merged into dev (squash).`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv[2]);
