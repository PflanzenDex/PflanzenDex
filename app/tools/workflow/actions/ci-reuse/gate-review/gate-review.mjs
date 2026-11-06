// `make gate-review` (US-QG-07): a read-only digest of the open pull requests into dev that change a gate file (isGateFile).
// Per pull request: its gate files, the CI state on its head as it stands (ci-verdict.mjs and ci-report.mjs, never waited
// for), whether it conflicts, its age and the direction of its gate changes (gate-direction.mjs). It merges, approves,
// comments on and edits nothing: every gate PR still gets a human merge (ADR 0005). REST only, through ci-wait.mjs.
import { fileURLToPath } from "node:url";
import { isBaselineFile } from "../../../../../../.claude/hooks/baseline-growth.mjs";
import { isGateFile } from "../../../../../../.claude/hooks/rules.mjs";
import { json, realClient, repoName, restList } from "../../../claim/lib/claim-client.mjs";
import { definedAt, readSnapshot } from "../ci-wait.mjs";
import { assess, MAX_FILES } from "../ci-verdict.mjs";
import { stateLine } from "../ci-report.mjs";
import { classifyFile, directionOf, needsText } from "./gate-direction.mjs";

const MAX_OPEN = 300; // the bound of the REST list of open pull requests, as the claim tools read it
const DAY_MS = 86_400_000;
const LABEL_WIDTH = 12;
const DIRECTION_TEXT = {
  looser: "looser (proven)",
  "read it": "read it (no looser change is proven, and not every change is classified)",
  "tighter only": "tighter only (proven)",
  unchanged: "no limit, baseline or allowlist value moved",
};
const FOOTER =
  "Not listed: pull requests that change only a baseline. A baseline is no gate file (US-QG-07); make merge refuses a PR that grows one.";

const daysSince = (iso, now) => Math.floor((now - Date.parse(iso)) / DAY_MS);
const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");
const firstLine = (err) =>
  String(err.stderr || err.message)
    .trim()
    .split("\n")[0];

/** The text of a file at a commit: `{ text }`, `{ absent: true }` for HTTP 404, or `{ error }` (then the file is read it). */
async function versionAt(client, repo, sha, path) {
  try {
    const body = await json(client, [
      "api",
      `repos/${repo}/contents/${encodePath(path)}?ref=${sha}`,
    ]);
    if (body.encoding !== "base64")
      return { error: "the file is too large to read through the API" };
    return { text: Buffer.from(body.content, "base64").toString("utf8") };
  } catch (err) {
    return /HTTP 404/.test(err.message) ? { absent: true } : { error: firstLine(err) };
  }
}

/** The commit where the PR's branch left dev, read once per PR and only when a judged file needs it. */
async function mergeBaseOf(client, repo, pr) {
  try {
    const body = await json(client, ["api", `repos/${repo}/compare/${pr.base}...${pr.head}`]);
    return { sha: body.merge_base_commit.sha };
  } catch (err) {
    return { error: firstLine(err) };
  }
}

/** The direction of a PR's changed gate and baseline files. Texts are read only where a rule judges them. */
async function directionOfPr(client, repo, pr, files) {
  const changed = files.filter((f) => isGateFile(f.filename) || isBaselineFile(f.filename));
  let base = null;
  const judgements = [];
  for (const { filename: path, status } of changed) {
    if (!needsText(path, status)) {
      judgements.push(classifyFile({ path, status }));
      continue;
    }
    base ??= await mergeBaseOf(client, repo, pr);
    const before = base.sha
      ? await versionAt(client, repo, base.sha, path)
      : { error: `the merge base is unknown (${base.error})` };
    const after = await versionAt(client, repo, pr.head, path);
    judgements.push(classifyFile({ path, status, before, after }));
  }
  return directionOf(judgements);
}

const conflictOf = (a) => {
  if (a.status === "conflict") return "yes, so it gets no CI run";
  return a.status === "computing" ? "not computed yet" : "no";
};

/** One gate PR as it stands: the head's files and jobs are read once, the CI per job by ci-verdict, never waited for. */
async function reviewGatePr(client, repo, listed, files) {
  const head = listed.head.sha;
  const defined = await definedAt(client, repo, head);
  const cache = new Map([[head, { files: files.map((f) => f.filename), defined }]]);
  const snap = await readSnapshot(client, listed.number, cache);
  const current =
    snap.head === head
      ? files
      : await restList(client, `repos/${repo}/pulls/${listed.number}/files`, MAX_FILES);
  const a = assess(snap);
  return {
    number: listed.number,
    title: snap.pr.title,
    draft: snap.pr.draft,
    created: listed.created_at,
    updated: listed.updated_at,
    gateFiles: current.map((f) => f.filename).filter(isGateFile),
    ci: stateLine(a),
    conflict: conflictOf(a),
    direction: await directionOfPr(client, repo, snap.pr, current),
  };
}

/** The gate PRs into dev. Files are read for every open PR, because that is how a gate PR is found; the rest only for gate PRs. */
export async function gateReview(client) {
  const repo = await repoName(client);
  const open = await restList(
    client,
    `repos/${repo}/pulls?state=open&base=dev&sort=created&direction=asc`,
    MAX_OPEN,
  );
  const rows = [];
  for (const listed of open) {
    const files = await restList(client, `repos/${repo}/pulls/${listed.number}/files`, MAX_FILES);
    if (files.some((f) => isGateFile(f.filename)))
      rows.push(await reviewGatePr(client, repo, listed, files));
  }
  return { rows, truncated: open.length >= MAX_OPEN };
}

function blockOf(row, now) {
  const { verdict, looser, tighter, readIt } = row.direction;
  const line = (label, text) => `  ${label.padEnd(LABEL_WIDTH)}${text}`;
  const items = [
    ["looser", looser],
    ["tighter", tighter],
    ["read it", readIt],
  ].flatMap(([label, texts]) => texts.map((text) => `    ${label.padEnd(9)} ${text}`));
  return [
    `#${row.number} ${row.title}${row.draft ? " [draft]" : ""}`,
    line("gate files", row.gateFiles.join(", ")),
    line("CI", row.ci),
    line("conflict", row.conflict),
    line(
      "age",
      `opened ${daysSince(row.created, now)} d ago, updated ${daysSince(row.updated, now)} d ago`,
    ),
    line("direction", DIRECTION_TEXT[verdict]),
    ...items,
  ].join("\n");
}

/** The digest as printed by `make gate-review`. Pure: the reading is in gateReview. */
export function renderDigest({ rows, truncated }, now) {
  const intro = rows.length
    ? `make gate-review: ${rows.length} open pull request(s) into dev change a gate file. Read-only: nothing is merged, approved, commented or edited. CI is read as it stands, not waited for.`
    : "make gate-review: no open pull request into dev changes a gate file.";
  const warning = truncated
    ? [`Warning: the list stops at ${MAX_OPEN} open pull requests; more may exist.`]
    : [];
  return [intro, ...rows.map((row) => blockOf(row, now)), ...warning, FOOTER].join("\n\n");
}

async function main() {
  const now = Date.now();
  console.log(renderDigest(await gateReview(realClient()), now));
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main().catch((err) => {
    console.error(`gate-review: ${err.message}`);
    return 1;
  });
}
