// US-DEV-08: `make claim` with an injected gh/git client (REST for the repository, GraphQL only for the board: FR-DEV-10, #1412)
import test from "node:test";
import assert from "node:assert/strict";
import { claim, ClaimRefused } from "./claim.mjs";
import { PreflightFailed } from "./claim-preflight.mjs";

const issue = {
  number: 62,
  title: "US-BES-06 · Delete specimen",
  state: "OPEN",
  url: "https://github.com/o/r/issues/62",
  labels: [{ name: "story" }],
  assignees: [],
};

const REPO = "PflanzenDex/PflanzenDex";
const PULLS_POST = /-X POST repos\/PflanzenDex\/PflanzenDex\/pulls/;

/** The issue as the REST route answers it: state in lower case, the browser URL as html_url. */
const restIssue = (i) => ({
  ...i,
  state: i.state.toLowerCase(),
  html_url: i.url,
  labels: i.labels ?? [],
  assignees: i.assignees ?? [],
  updated_at: "2026-11-01T00:00:00Z",
});

/** A pull request as the REST pulls route answers it. */
const restPr = (p) => ({
  number: p.number,
  title: p.title,
  body: p.body ?? "",
  state: p.state === "OPEN" ? "open" : "closed",
  merged_at: p.mergedAt ?? null,
  draft: false,
  head: { ref: p.headRefName ?? "" },
});

// Fake client: answers by the first matching rule on "cmd arg arg ..."; records every call.
function fake({
  issues = [issue],
  prs = [],
  branches = "",
  pushFails = false,
  prFails = false,
  graphqlFails = false,
  board,
} = {}) {
  const calls = [];
  let views = 0;
  const fail = (message) => () => {
    throw new Error(message);
  };
  const meta = {
    data: {
      organization: {
        projectV2: {
          id: "PROJ",
          fields: {
            nodes: [
              {
                id: "F",
                name: "Status",
                options: [
                  { id: "O", name: "In Progress" },
                  { id: "T", name: "Todo" },
                ],
              },
            ],
          },
        },
      },
    },
  };
  // The board item of issue 62, in the shape of the single-issue GraphQL query (board-client.mjs).
  const itemOfBoard = (number) => {
    const hit = (board?.items ?? []).find((i) => i.content?.number === number);
    if (!hit) return null;
    const value = (name) => (name ? { name } : null);
    return {
      id: hit.id,
      project: { number: 2, owner: { login: "PflanzenDex" } },
      status: value(hit.status),
      priority: value(hit.priority),
      typ: value(hit.typ),
      epic: null,
      release: null,
    };
  };
  const graphql = (line) => {
    if (graphqlFails) throw new Error("GraphQL: API rate limit already exceeded for user ID 1.");
    if (line.includes("fields(first")) return JSON.stringify(meta);
    if (!board) throw new Error("no board");
    const nodes = [itemOfBoard(62)].filter(Boolean);
    return JSON.stringify({ data: { repository: { issue: { projectItems: { nodes } } } } });
  };
  const rules = [
    [
      `gh api repos/${REPO}/issues/62`,
      () => JSON.stringify(restIssue(issues[Math.min(views++, issues.length - 1)])),
    ],
    [`gh api repos/${REPO}/pulls`, () => JSON.stringify(prs.map(restPr))],
    ["gh api repos/{owner}/{repo}", () => `${REPO}\n`],
    ["gh api user", () => "max\n"],
    ["git ls-remote", () => branches],
    ["gh api graphql", graphql],
    [`gh api -X POST repos/${REPO}/issues/62/assignees`, () => "{}"],
    [`gh api -X DELETE repos/${REPO}/issues/62/assignees`, () => "{}"],
    [
      `gh api -X POST repos/${REPO}/pulls`,
      prFails
        ? fail("gh down")
        : () => JSON.stringify({ html_url: "https://github.com/o/r/pull/9" }),
    ],
    ["gh project item-add", () => JSON.stringify({ id: "ITEM" })],
    ["git rev-parse", () => "tree\n"],
    ["git commit-tree", () => "abc123\n"],
    ["git push origin --delete", () => ""],
    ["git push", pushFails ? fail("rejected") : () => ""],
  ];
  return {
    calls,
    async run(cmd, args) {
      const line = `${cmd} ${args.join(" ")}`;
      calls.push(line);
      const rule = rules.find(([prefix]) => line.startsWith(prefix));
      return rule ? rule[1](line) : "";
    },
  };
}

const quiet = { log() {} };

test("US-DEV-08: a free story is assigned, set In Progress, pushed and opened as draft PR", async () => {
  const client = fake();
  const result = await claim(client, 62, quiet);
  assert.equal(result.branch, "feat/bes-06-delete-specimen");
  const all = client.calls.join("\n");
  assert.match(
    all,
    /-X POST repos\/PflanzenDex\/PflanzenDex\/issues\/62\/assignees -f assignees\[\]=max/,
  );
  assert.match(
    all,
    /gh project item-edit --id ITEM --project-id PROJ --field-id F --single-select-option-id O/,
  );
  assert.match(all, /git push origin abc123:refs\/heads\/feat\/bes-06-delete-specimen/);
  assert.match(
    all,
    /-X POST repos\/PflanzenDex\/PflanzenDex\/pulls .*-f head=feat\/bes-06-delete-specimen -f base=dev -F draft=true/,
  );
  assert.doesNotMatch(all, /--no-verify|--force/);
});

test("FR-DEV-10: a claim reads the board once and runs no gh issue or gh pr command (GraphQL) for the repository", async () => {
  const client = fake({ board: { items: [{ id: "I", content: { number: 62 }, priority: "P1" }] } });
  await claim(client, 62, quiet);
  assert.equal(client.calls.filter((c) => c.includes("projectItems")).length, 1);
  assert.ok(!client.calls.some((c) => /^gh (issue|pr) /.test(c)));
});

test("FR-DEV-10: a claim survives an exhausted GraphQL budget: REST writes go through, the board status is a warning", async () => {
  const logs = [];
  const client = fake({ graphqlFails: true });
  const result = await claim(client, 62, { log: (l) => logs.push(l) });
  assert.equal(result.url, "https://github.com/o/r/pull/9");
  assert.ok(logs.some((l) => /WARNING: project status not set \(.*rate limit/.test(l)));
  assert.ok(
    logs.some((l) => /Could not read the board type|could not read the board type/.test(l)),
  );
  assert.ok(
    client.calls.some((c) => PULLS_POST.test(c)),
    "the draft PR is opened over REST",
  );
});

test("US-DEV-08: an assigned issue is refused and nothing is written", async () => {
  const client = fake({ issues: [{ ...issue, assignees: [{ login: "konradhe14" }] }] });
  await assert.rejects(
    claim(client, 62, quiet),
    (e) => e instanceof ClaimRefused && /@konradhe14/.test(e.message),
  );
  assert.ok(!client.calls.some((c) => /-X |git push/.test(c)));
});

test("US-DEV-08: a PR that closes the issue refuses the claim and names the PR", async () => {
  const prs = [{ number: 5, title: "feat(bes): x", body: "Closes #62", state: "OPEN" }];
  await assert.rejects(claim(fake({ prs }), 62, quiet), /PR #5/);
});

test("US-DEV-08: an origin branch with the story ID refuses the claim", async () => {
  const branches = "sha1\trefs/heads/feat/bes-06-konrad\n";
  await assert.rejects(claim(fake({ branches }), 62, quiet), /origin\/feat\/bes-06-konrad/);
});

test("US-DEV-08: the exact branch name already on origin refuses the claim", async () => {
  const branches = "sha1\trefs/heads/feat/bes-06-delete-specimen\n";
  await assert.rejects(claim(fake({ branches }), 62, quiet), ClaimRefused);
});

test("US-DEV-08: losing the race for the assignee steps back and deletes its own branch", async () => {
  const taken = { ...issue, assignees: [{ login: "konradhe14" }] };
  const client = fake({ issues: [issue, taken] });
  await assert.rejects(claim(client, 62, quiet), /claimed #62 first/);
  assert.ok(client.calls.some((c) => /-X DELETE .*assignees/.test(c)));
  assert.ok(
    client.calls.some((c) => /git push origin --delete feat\/bes-06-delete-specimen/.test(c)),
  );
  assert.ok(!client.calls.some((c) => PULLS_POST.test(c)));
});

test("US-DEV-08: the branch is pushed before the issue is assigned", async () => {
  const client = fake();
  await claim(client, 62, quiet);
  const at = (re) => client.calls.findIndex((c) => re.test(c));
  assert.ok(at(/^git push origin abc123/) < at(/-X POST .*assignees/));
});

test("US-DEV-08: a failing push leaves no assignee behind and writes nothing", async () => {
  const client = fake({ pushFails: true });
  await assert.rejects(claim(client, 62, quiet), /rejected/);
  assert.ok(!client.calls.some((c) => /-X /.test(c)));
});

test("US-DEV-08: a failing PR creation rolls back assignee, status and branch", async () => {
  const client = fake({ prFails: true });
  await assert.rejects(claim(client, 62, quiet), /gh down/);
  const all = client.calls.join("\n");
  assert.match(all, /-X DELETE repos\/PflanzenDex\/PflanzenDex\/issues\/62\/assignees/);
  assert.match(all, /git push origin --delete feat\/bes-06-delete-specimen/);
  assert.match(all, /item-edit .*--single-select-option-id T/);
});

test("US-DEV-08: re-running after a half claim of the caller continues", async () => {
  const mine = { ...issue, assignees: [{ login: "max" }] };
  const result = await claim(fake({ issues: [mine] }), 62, quiet);
  assert.equal(result.branch, "feat/bes-06-delete-specimen");
});

test("FR-DEV-10: a needs-triage issue is refused by make claim and nothing is written", async () => {
  const triage = { ...issue, labels: [{ name: "story" }, { name: "needs-triage" }] };
  const client = fake({ issues: [triage] });
  await assert.rejects(
    claim(client, 62, quiet),
    (e) => e instanceof ClaimRefused && /needs-triage/.test(e.message),
  );
  assert.ok(!client.calls.some((c) => /-X |git push/.test(c)));
});

test("US-DEV-08: a half claim of the caller with a branch on origin is still refused", async () => {
  const mine = { ...issue, assignees: [{ login: "max" }] };
  const branches = "sha1\trefs/heads/feat/bes-06-delete-specimen\n";
  await assert.rejects(claim(fake({ issues: [mine], branches }), 62, quiet), ClaimRefused);
});

test("US-DEV-08: a failing preflight stops before any write", async () => {
  const client = fake();
  const preflight = async () => {
    throw new PreflightFailed(["node_modules missing: run make setup"]);
  };
  await assert.rejects(claim(client, 62, { ...quiet, preflight }), /make setup/);
  assert.ok(!client.calls.some((c) => /-X |git push/.test(c)));
});

test("US-DEV-08: the draft PR title carries type, epic scope and story ID", async () => {
  const client = fake();
  await claim(client, 62, quiet);
  const create = client.calls.find((c) => PULLS_POST.test(c));
  assert.match(create, /-f title=feat\(bes\): delete specimen \(US-BES-06\)/);
});

test("US-DEV-05: a claim of an issue without a priority warns, and still succeeds", async () => {
  const logs = [];
  const client = fake({
    board: { items: [{ id: "I", content: { number: 62 }, status: "Todo" }] },
  });
  await claim(client, 62, { log: (m) => logs.push(m) });
  assert.ok(logs.some((l) => /Warning: #62 has no priority/.test(l)));
  assert.ok(logs.some((l) => /Draft PR/.test(l)));
});

test("US-DEV-05: no warning when the priority is set; a failed lookup is reported, not swallowed", async () => {
  const logs = [];
  const set = fake({
    board: { items: [{ id: "I", content: { number: 62 }, status: "Todo", priority: "P1 high" }] },
  });
  await claim(set, 62, { log: (m) => logs.push(m) });
  assert.ok(!logs.some((l) => /Warning/.test(l)));
  await claim(fake(), 62, { log: (m) => logs.push(m) });
  assert.ok(logs.some((l) => /Warning: could not check the priority of #62/.test(l)));
});

test("US-DEV-08: the branch type comes from the board type, not from the issue labels", async () => {
  const board = { items: [{ id: "I", content: { number: 62 }, typ: "Bug" }] };
  const result = await claim(fake({ board }), 62, quiet);
  assert.equal(result.branch, "fix/bes-06-delete-specimen");
});

test("US-DEV-08: a board that cannot be read is reported and the labels decide (P-10)", async () => {
  const lines = [];
  const result = await claim(fake(), 62, { log: (l) => lines.push(l) });
  assert.equal(result.branch, "feat/bes-06-delete-specimen");
  assert.ok(lines.some((l) => /could not read the board type of #62/.test(l)));
});
