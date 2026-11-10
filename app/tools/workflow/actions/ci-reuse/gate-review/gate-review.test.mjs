import assert from "node:assert/strict";
import { test } from "node:test";
import { stateLine } from "../ci-report.mjs";
import { gateReview, renderDigest } from "./gate-review.mjs";

const NOW = Date.parse("2026-11-06T12:00:00Z");
const REPO = "repos/PflanzenDex/PflanzenDex";
const BASE_SHA = "base-sha-0001";
const CI_YML = ["changes", "layout", "dependency-review", "metadata", "app-gates"]
  .map((job) => `  ${job}:\n    runs-on: ubuntu-latest\n`)
  .join("");
const JOBS_TEXT = `name: ci\non: pull_request\njobs:\n${CI_YML}`;

// A fake of the REST answers gate-review reads. Any write (-X, -f, -F) is recorded and refused.
function fakeGitHub({ prs, files, texts }) {
  const calls = [];
  const writes = [];
  const page = (items, url) => {
    const n = Number(url.searchParams.get("page") ?? 1);
    return items.slice((n - 1) * 100, n * 100);
  };
  const checkRuns = (sha) =>
    ["changes", "layout", "dependency-review", "metadata", "app-gates", "ci-status"].map(
      (name) => ({
        name,
        app: { slug: "github-actions" },
        status: "completed",
        conclusion: "success",
        details_url: `https://github.com/PflanzenDex/PflanzenDex/actions/runs/7/job/${sha.length}`,
        completed_at: "2026-11-06T10:00:00Z",
      }),
    );
  const answer = (url) => {
    const path = url.pathname.slice(1);
    const ref = url.searchParams.get("ref");
    if (path === `${REPO}/pulls`) return page(prs, url);
    const filesOf = /^repos\/PflanzenDex\/PflanzenDex\/pulls\/(\d+)\/files$/.exec(path);
    if (filesOf) return page(files[filesOf[1]], url);
    const single = /^repos\/PflanzenDex\/PflanzenDex\/pulls\/(\d+)$/.exec(path);
    if (single) {
      const pr = prs.find((p) => String(p.number) === single[1]);
      return {
        number: pr.number,
        title: pr.title,
        html_url: pr.html_url,
        state: "open",
        merged: false,
        merged_at: null,
        draft: pr.draft,
        base: { ref: "dev" },
        head: { sha: pr.head.sha },
        mergeable: true,
        mergeable_state: "clean",
      };
    }
    if (/^repos\/PflanzenDex\/PflanzenDex\/compare\/dev\.\.\.[^/]+$/.test(path))
      return { merge_base_commit: { sha: BASE_SHA } };
    const commit = /^repos\/PflanzenDex\/PflanzenDex\/commits\/([^/]+)\/check-runs$/.exec(path);
    if (commit) return { check_runs: page(checkRuns(commit[1]), url) };
    if (path === `${REPO}/actions/runs`) return { workflow_runs: [] };
    const contents = /^repos\/PflanzenDex\/PflanzenDex\/contents\/(.+)$/.exec(path);
    if (contents && texts.has(`${ref}|${contents[1]}`)) {
      return {
        encoding: "base64",
        content: Buffer.from(texts.get(`${ref}|${contents[1]}`)).toString("base64"),
      };
    }
    throw new Error(`fake: no answer for ${path}?ref=${ref} (HTTP 404)`);
  };
  return {
    calls,
    writes,
    async run(cmd, args) {
      calls.push(args[1]);
      if (args.some((a) => ["-X", "-f", "-F", "--method"].includes(a))) {
        writes.push(args.join(" "));
        throw new Error("fake: a write was attempted");
      }
      if (args[1] === "repos/{owner}/{repo}") return "PflanzenDex/PflanzenDex\n";
      return JSON.stringify(answer(new URL(args[1], "https://api.github.test/")));
    },
  };
}

const pr = (number, sha, extra = {}) => ({
  number,
  title: `feat(qg): pull request ${number}`,
  html_url: `https://github.com/PflanzenDex/PflanzenDex/pull/${number}`,
  draft: false,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-05T10:00:00Z",
  head: { sha, ref: `branch-${number}` },
  base: { ref: "dev" },
  ...extra,
});

const appFiles = (count) =>
  Array.from({ length: count }, (_, i) => ({
    filename: `app/packages/web/src/f${i}.tsx`,
    status: "modified",
  }));

test("US-QG-07: gate-review reads the checks of gate PRs only, pages long file lists, and writes nothing", async () => {
  const limitsBefore = JSON.stringify({ bundle: { initialJsGzipBytes: 125000 } });
  const limitsAfter = JSON.stringify({ bundle: { initialJsGzipBytes: 140000 } });
  const client = fakeGitHub({
    prs: [pr(11, "head11"), pr(12, "head12"), pr(13, "head13")],
    files: {
      11: [{ filename: "app/packages/web/src/x.tsx", status: "modified" }],
      12: [
        { filename: "app/config/gates/quality-limits.json", status: "modified" },
        { filename: ".github/workflows/ci.yml", status: "modified" },
      ],
      13: [...appFiles(149), { filename: "Makefile", status: "modified" }],
    },
    texts: new Map([
      [`${BASE_SHA}|app/config/gates/quality-limits.json`, limitsBefore],
      [`head12|app/config/gates/quality-limits.json`, limitsAfter],
      ["head12|.github/workflows/ci.yml", JOBS_TEXT],
      ["head13|.github/workflows/ci.yml", JOBS_TEXT],
    ]),
  });
  const result = await gateReview(client);

  assert.deepEqual(client.writes, []);
  assert.deepEqual(
    result.rows.map((r) => r.number),
    [12, 13],
  );
  assert.equal(
    client.calls.includes(`${REPO}/pulls/11`),
    false,
    "a PR without a gate file gets no single-PR read",
  );
  assert.equal(
    client.calls.some((c) => c.includes("commits/head11/")),
    false,
  );
  assert.equal(
    client.calls.some((c) => c.includes("commits/head12/check-runs")),
    true,
  );
  assert.equal(
    client.calls.includes(`${REPO}/pulls/13/files?per_page=100&page=2`),
    true,
    "a long file list is paged",
  );

  const [row12, row13] = result.rows;
  assert.equal(row12.direction.verdict, "looser");
  assert.deepEqual(row12.direction.looser, [
    "app/config/gates/quality-limits.json: bundle.initialJsGzipBytes raised from 125000 to 140000",
  ]);
  assert.deepEqual(row12.direction.readIt, [".github/workflows/ci.yml: a workflow"]);
  assert.match(row12.ci, /^green, every required job succeeded on head12/);
  assert.equal(row12.conflict, "no");
  assert.equal(row13.direction.verdict, "read it");
  assert.deepEqual(row13.direction.readIt, ["Makefile: the Makefile"]);
});

test("US-QG-07: an empty list says that no gate PR is open, and a cut list is reported", () => {
  const empty = renderDigest({ rows: [], truncated: false }, NOW);
  assert.match(empty, /no open pull request into dev changes a gate file/);
  assert.match(
    renderDigest({ rows: [], truncated: true }, NOW),
    /the list stops at 300 open pull requests/,
  );
});

test("US-QG-07: the digest lists number, gate files, CI, conflict, age and direction of each PR, and never says safe", () => {
  const row = {
    number: 1507,
    title: "chore(qg): raise the bundle budget",
    draft: true,
    created: "2026-11-01T10:00:00Z",
    updated: "2026-11-05T10:00:00Z",
    gateFiles: ["app/config/gates/quality-limits.json", ".github/workflows/ci.yml"],
    ci: "running, not waited for: app-tests (ci-status: success, not judged)",
    conflict: "no",
    direction: {
      verdict: "looser",
      looser: [
        "app/config/gates/quality-limits.json: bundle.initialJsGzipBytes raised from 125000 to 140000",
      ],
      tighter: [],
      readIt: [".github/workflows/ci.yml: a workflow"],
    },
  };
  const out = renderDigest(
    {
      rows: [
        row,
        {
          ...row,
          number: 1508,
          direction: { ...row.direction, verdict: "unchanged", looser: [], readIt: [] },
        },
      ],
      truncated: false,
    },
    NOW,
  );
  assert.match(out, /#1507 chore\(qg\): raise the bundle budget \[draft\]/);
  assert.match(
    out,
    /gate files {2}app\/config\/gates\/quality-limits\.json, \.github\/workflows\/ci\.yml/,
  );
  assert.match(out, /CI {10}running, not waited for: app-tests/);
  assert.match(out, /conflict {4}no/);
  assert.match(out, /age {9}opened 5 d ago, updated 1 d ago/);
  assert.match(out, /direction {3}looser \(proven\)/);
  assert.match(out, /looser {4}app\/config\/gates\/quality-limits\.json: bundle/);
  assert.match(out, /read it {3}\.github\/workflows\/ci\.yml: a workflow/);
  assert.match(out, /direction {3}no limit, baseline or allowlist value moved/);
  assert.doesNotMatch(out, /safe/i);
});

test("US-QG-07: the CI line reports a running job as running, not waited for, and never waits", () => {
  const head = "1a2b3c4d5e6f";
  assert.equal(
    stateLine({
      status: "running",
      unfinished: ["app-tests", "e2e"],
      aggregate: { conclusion: "success" },
      head,
    }),
    "running, not waited for: app-tests, e2e (ci-status: success, not judged)",
  );
  assert.equal(
    stateLine({
      status: "running",
      unfinished: ["a", "b", "c", "d", "e", "f"],
      aggregate: null,
      head,
    }),
    "running, not waited for: a, b, c, d and 2 more (ci-status: none, not judged)",
  );
});

test("US-QG-07: the CI line names a failed job, a conflict and a PR whose mergeability is not known yet", () => {
  const head = "1a2b3c4d5e6f";
  assert.equal(
    stateLine({
      status: "settled",
      problems: ["app-tests: failure"],
      aggregate: { conclusion: "failure" },
      head,
    }),
    "not green: app-tests: failure (ci-status: failure, not judged)",
  );
  assert.equal(
    stateLine({ status: "settled", problems: [], aggregate: { conclusion: "success" }, head }),
    "green, every required job succeeded on 1a2b3c4d (ci-status: success, not judged)",
  );
  assert.equal(
    stateLine({ status: "conflict", head }),
    "not run: the PR conflicts with dev, so it gets no CI run",
  );
  assert.equal(
    stateLine({ status: "computing", head }),
    "not known yet: GitHub has not computed whether the PR merges",
  );
});
