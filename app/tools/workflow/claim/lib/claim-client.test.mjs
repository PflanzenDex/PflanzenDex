// FR-DEV-10 (#1412): the repository, issue and pull request reads use REST, and a GraphQL error is never an empty answer
import test from "node:test";
import assert from "node:assert/strict";
import {
  createIssueRest,
  fetchIssue,
  fetchOpenIssues,
  fetchPrs,
  graphql,
  setAssignee,
} from "./claim-client.mjs";

const REPO = "PflanzenDex/PflanzenDex";

/** Fake gh: records every call and answers by the first matching rule (the call line starts with its prefix). */
function fakeGh(rules) {
  const calls = [];
  return {
    calls,
    async run(cmd, args) {
      const line = `${cmd} ${args.join(" ")}`;
      calls.push(line);
      const rule = rules.find(([prefix]) => line.startsWith(prefix));
      if (!rule) throw new Error(`no answer for: ${line}`);
      return typeof rule[1] === "function" ? rule[1](line) : rule[1];
    },
  };
}

const page = (n, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({
    number: i + 1,
    title: `PR ${i + 1}`,
    state: "open",
    ...extra,
  }));

test("FR-DEV-10: fetchIssue reads the issue over REST in the shape the claim rules read", async () => {
  const client = fakeGh([
    [
      `gh api repos/${REPO}/issues/62`,
      JSON.stringify({
        number: 62,
        title: "T",
        state: "closed",
        html_url: "https://github.com/o/r/issues/62",
        labels: [{ name: "story" }],
        assignees: [{ login: "max" }],
      }),
    ],
    ["gh api repos/{owner}/{repo}", `${REPO}\n`],
  ]);
  const issue = await fetchIssue(client, 62);
  assert.equal(issue.state, "CLOSED");
  assert.equal(issue.url, "https://github.com/o/r/issues/62");
  assert.deepEqual(issue.assignees, [{ login: "max" }]);
});

test("FR-DEV-10: the repository name is read once per run, not once per call", async () => {
  const client = fakeGh([
    ["gh api repos/{owner}/{repo}", `${REPO}\n`],
    [`gh api repos/${REPO}/issues/1`, JSON.stringify({ number: 1, title: "T", state: "open" })],
  ]);
  await fetchIssue(client, 1);
  await fetchIssue(client, 1);
  assert.equal(client.calls.filter((c) => c.includes("{owner}/{repo}")).length, 1);
});

test("FR-DEV-10: fetchPrs pages over REST (100 per page) and keeps the 300 newest, mapped to the claim shape", async () => {
  const pages = [page(100), page(100), page(100), page(100)];
  const client = fakeGh([
    ["gh api repos/{owner}/{repo}", `${REPO}\n`],
    [
      `gh api repos/${REPO}/pulls?`,
      (line) => JSON.stringify(pages[Number(line.match(/&page=(\d+)/)[1]) - 1]),
    ],
  ]);
  const prs = await fetchPrs(client);
  assert.equal(prs.length, 300);
  assert.equal(
    client.calls.filter((c) => c.includes("/pulls?")).length,
    3,
    "three pages, not four",
  );
  const merged = await onePr({
    merged_at: "2026-11-01T00:00:00Z",
    state: "closed",
    draft: true,
    head: { ref: "feat/x" },
  });
  assert.equal(merged.state, "MERGED");
  assert.equal(merged.mergedAt, "2026-11-01T00:00:00Z");
  assert.equal(merged.isDraft, true);
  assert.equal(merged.headRefName, "feat/x");
  assert.equal((await onePr({ state: "closed", merged_at: null })).state, "CLOSED");
});

/** One pull request from the REST pulls route, mapped by fetchPrs. */
async function onePr(raw) {
  const client = fakeGh([
    ["gh api repos/{owner}/{repo}", `${REPO}\n`],
    [
      `gh api repos/${REPO}/pulls?`,
      JSON.stringify([{ number: 1, title: "T", body: null, ...raw }]),
    ],
  ]);
  return (await fetchPrs(client))[0];
}

test("FR-DEV-10: fetchOpenIssues leaves pull requests out of the REST issue list", async () => {
  const client = fakeGh([
    ["gh api repos/{owner}/{repo}", `${REPO}\n`],
    [
      `gh api repos/${REPO}/issues?`,
      JSON.stringify([
        { number: 7, title: "Issue", state: "open", labels: [], assignees: [] },
        { number: 8, title: "A pull request", state: "open", pull_request: {} },
      ]),
    ],
  ]);
  const issues = await fetchOpenIssues(client);
  assert.deepEqual(
    issues.map((i) => i.number),
    [7],
  );
});

test("FR-DEV-10: a GraphQL error throws with its message, it is never an empty answer (P-10)", async () => {
  const client = fakeGh([
    [
      "gh api graphql",
      JSON.stringify({ data: null, errors: [{ message: "API rate limit already exceeded" }] }),
    ],
  ]);
  await assert.rejects(
    graphql(client, "query { viewer { login } }"),
    /API rate limit already exceeded/,
  );
});

test("FR-DEV-10: createIssueRest posts the labels as an array and returns the number and URL", async () => {
  const client = fakeGh([
    ["gh api repos/{owner}/{repo}", `${REPO}\n`],
    [
      `gh api -X POST repos/${REPO}/issues`,
      JSON.stringify({ number: 1234, html_url: "https://github.com/o/r/issues/1234" }),
    ],
  ]);
  const created = await createIssueRest(client, {
    repo: REPO,
    title: "T",
    body: "B",
    labels: ["story", "epic:ACC"],
  });
  assert.deepEqual(created, { number: 1234, url: "https://github.com/o/r/issues/1234" });
  const post = client.calls.find((c) => c.includes("-X POST"));
  assert.match(post, /-f labels\[\]=story -f labels\[\]=epic:ACC/);
});

test("FR-DEV-10: setAssignee adds and removes one login over REST", async () => {
  const client = fakeGh([
    ["gh api repos/{owner}/{repo}", `${REPO}\n`],
    [`gh api -X`, "{}"],
  ]);
  await setAssignee(client, 62, "max", true);
  await setAssignee(client, 62, "max", false);
  assert.ok(
    client.calls.includes(`gh api -X POST repos/${REPO}/issues/62/assignees -f assignees[]=max`),
  );
  assert.ok(
    client.calls.includes(`gh api -X DELETE repos/${REPO}/issues/62/assignees -f assignees[]=max`),
  );
});
