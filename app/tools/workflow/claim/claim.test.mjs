// US-DEV-08: `make claim` with an injected gh/git client (REST for the repository, GraphQL only for the board: FR-DEV-10, #1412).
// The fake models origin: a pushed claim branch shows up in ls-remote and can be deleted, so the undo checks see what the real
// origin would show (#1487).
import test from "node:test";
import assert from "node:assert/strict";
import { claim, ClaimRefused, timeoutsOf } from "./claim.mjs";
import { PreflightFailed } from "./claim-preflight.mjs";
import { PUSH_LIMIT } from "./lib/claim-client.mjs";
import { deleteClaimBranch } from "./lib/writes/claim-steps.mjs";

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
const STANDARD_FETCH = "+refs/heads/*:refs/remotes/origin/*";

/** The issue as the REST route answers it: state in lower case, the browser URL as html_url, the GraphQL node id. */
const restIssue = (i) => ({
  ...i,
  state: i.state.toLowerCase(),
  html_url: i.url,
  labels: i.labels ?? [],
  assignees: i.assignees ?? [],
  updated_at: "2026-11-01T00:00:00Z",
  node_id: "I_kw62",
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

/**
 * Fake client: answers by the first matching rule on "cmd arg arg ..."; records every call.
 * Options: trackedRefs (standard fetch refspec), pushFails (refused), pushApplies (pushed, answer lost), assignApplies (assignee
 * added, answer lost), raceWith (somebody else is in the assignee answer), undoFails / undoAlwaysFails (assignee DELETE).
 */
const DEFAULTS = {
  issues: [issue],
  prs: [],
  branches: "",
  trackedRefs: false,
  pushFails: false,
  pushApplies: false,
  prFails: false,
  assignApplies: false,
  raceWith: null,
  undoFails: 0,
  undoAlwaysFails: false,
  graphqlFails: false,
  board: undefined,
};

function fake(options = {}) {
  const {
    issues,
    prs,
    branches,
    trackedRefs,
    pushFails,
    pushApplies,
    prFails,
    assignApplies,
    raceWith,
    undoFails,
    undoAlwaysFails,
    graphqlFails,
    board,
  } = { ...DEFAULTS, ...options };
  const calls = [];
  const limits = []; // every call with the limit option it was given (undefined for the default)
  let views = 0;
  let undoFailuresLeft = undoFails;
  const origin = new Map([
    ["main", "m1"],
    ["dev", "d1"],
  ]); // branch name -> sha on origin
  for (const line of branches.split("\n").filter(Boolean)) {
    const [sha, ref] = line.split("\t");
    origin.set(ref.replace("refs/heads/", ""), sha);
  }
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
    if (line.includes("addProjectV2ItemById"))
      return JSON.stringify({ data: { addProjectV2ItemById: { item: { id: "NEW" } } } });
    if (line.includes("updateProjectV2ItemFieldValue"))
      return JSON.stringify({
        data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM" } } },
      });
    if (!board) throw new Error("no board");
    const nodes = [itemOfBoard(62)].filter(Boolean);
    return JSON.stringify({ data: { repository: { issue: { projectItems: { nodes } } } } });
  };
  // `git ls-remote --heads origin [refs/heads/<name>]`: all branches, or the one named by the pattern.
  const lsRemote = (line) => {
    const pattern = line.split(" ").find((a) => a.startsWith("refs/heads/"));
    const lines = [...origin]
      .filter(([name]) => !pattern || pattern === `refs/heads/${name}`)
      .map(([name, sha]) => `${sha}\trefs/heads/${name}`);
    return lines.length ? `${lines.join("\n")}\n` : "";
  };
  const assigneeAnswer = () =>
    JSON.stringify({
      ...restIssue(issues[0]),
      assignees: [{ login: "max" }, ...(raceWith ? [{ login: raceWith }] : [])],
    });
  const rules = [
    [
      `gh api repos/${REPO}/issues/62`,
      () => JSON.stringify(restIssue(issues[Math.min(views++, issues.length - 1)])),
    ],
    [`gh api repos/${REPO}/pulls`, () => JSON.stringify(prs.map(restPr))],
    ["gh api repos/{owner}/{repo}", () => `${REPO}\n`],
    ["gh api user", () => "max\n"],
    ["git ls-remote", lsRemote],
    ["git config --get-all remote.origin.fetch", () => (trackedRefs ? `${STANDARD_FETCH}\n` : "")],
    [
      "git for-each-ref",
      () => [...origin.keys(), "HEAD"].map((n) => `refs/remotes/origin/${n}`).join("\n") + "\n",
    ],
    ["gh api graphql", graphql],
    [
      `gh api -X POST repos/${REPO}/issues/62/assignees`,
      assignApplies ? fail("gh: connection reset") : () => assigneeAnswer(),
    ],
    [
      `gh api -X DELETE repos/${REPO}/issues/62/assignees`,
      () => {
        if (undoAlwaysFails || undoFailuresLeft > 0) {
          undoFailuresLeft -= 1;
          throw new Error("gh: network is unreachable");
        }
        return "{}";
      },
    ],
    [
      `gh api -X POST repos/${REPO}/pulls`,
      prFails
        ? fail("gh down")
        : () => JSON.stringify({ html_url: "https://github.com/o/r/pull/9" }),
    ],
    ["git rev-parse", () => "tree\n"],
    ["git commit-tree", () => "abc123\n"],
    [
      "git push origin --delete ",
      (line) => {
        origin.delete(line.split(" ").pop());
        return "";
      },
    ],
    [
      "git push origin ",
      (line) => {
        const [, sha, name] = line.match(/^git push origin (\S+):refs\/heads\/(\S+)$/);
        if (pushFails) throw new Error("rejected");
        if (origin.has(name)) throw new Error("rejected: the branch exists");
        origin.set(name, sha);
        if (pushApplies) throw new Error("connection reset after the push");
        return "";
      },
    ],
  ];
  return {
    calls,
    limits,
    async run(cmd, args, options = {}) {
      const line = `${cmd} ${args.join(" ")}`;
      calls.push(line);
      limits.push({ line, limit: options.limit });
      const rule = rules.find(([prefix]) => line.startsWith(prefix));
      return rule ? rule[1](line) : "";
    },
  };
}

const quiet = { log() {}, retryDelayMs: 0 };

test("US-DEV-08: a free story is assigned, set In Progress, pushed and opened as draft PR", async () => {
  const client = fake();
  const result = await claim(client, 62, quiet);
  assert.equal(result.branch, "feat/bes-06-delete-specimen");
  const all = client.calls.join("\n");
  assert.match(
    all,
    /-X POST repos\/PflanzenDex\/PflanzenDex\/issues\/62\/assignees -f assignees\[\]=max/,
  );
  // Not on the board yet: added by the node id, then the Status option is written (two GraphQL mutations, #1487).
  assert.ok(
    client.calls.some((c) => c.includes("-f content=I_kw62") && c.includes("addProjectV2ItemById")),
  );
  assert.ok(
    client.calls.some(
      (c) => c.includes("updateProjectV2ItemFieldValue") && c.includes("-f option=O"),
    ),
  );
  assert.doesNotMatch(all, /gh project (item-add|item-edit)/);
  assert.match(all, /git push origin abc123:refs\/heads\/feat\/bes-06-delete-specimen/);
  assert.match(
    all,
    /-X POST repos\/PflanzenDex\/PflanzenDex\/pulls .*-f head=feat\/bes-06-delete-specimen -f base=dev -F draft=true/,
  );
  assert.doesNotMatch(all, /--no-verify|--force/);
});

test("FR-DEV-10: a claim reads the board once and runs no gh issue or gh pr command (GraphQL)", async () => {
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

// Every refusal of the claim check, once with the branches from the remote-tracking refs and once with ls-remote (#1487).
for (const trackedRefs of [true, false]) {
  const mode = trackedRefs ? "remote-tracking refs" : "ls-remote";
  const refused = (name, options, pattern) =>
    test(`US-DEV-08: refusal holds with ${mode}: ${name}`, async () => {
      const client = fake({ trackedRefs, ...options });
      await assert.rejects(claim(client, 62, quiet), (e) => {
        assert.ok(e instanceof ClaimRefused, `not refused: ${e.message}`);
        assert.match(e.message, pattern);
        return true;
      });
      assert.ok(!client.calls.some((c) => /-X |git push/.test(c)), "nothing is written");
      assert.equal(
        client.calls.some((c) => c.startsWith("git ls-remote")),
        !trackedRefs,
        "ls-remote is asked only with a narrow refspec",
      );
    });
  refused(
    "assignee",
    { issues: [{ ...issue, assignees: [{ login: "konradhe14" }] }] },
    /@konradhe14/,
  );
  refused(
    "open PR closes the issue",
    { prs: [{ number: 5, title: "feat(bes): x", body: "Closes #62", state: "OPEN" }] },
    /PR #5 \(open\)/,
  );
  refused(
    "merged PR closes the issue (it went into dev, the issue stays open)",
    {
      prs: [
        {
          number: 6,
          title: "feat(bes): x",
          body: "Closes #62",
          state: "CLOSED",
          mergedAt: "2026-11-01T00:00:00Z",
        },
      ],
    },
    /PR #6 \(merged\)/,
  );
  refused(
    "branch with the story ID",
    { branches: "sha1\trefs/heads/feat/bes-06-konrad\n" },
    /origin\/feat\/bes-06-konrad/,
  );
  refused(
    "exact branch name",
    { branches: "sha1\trefs/heads/feat/bes-06-delete-specimen\n" },
    /branch origin\/feat\/bes-06-delete-specimen exists/,
  );
  refused(
    "needs-triage label",
    { issues: [{ ...issue, labels: [{ name: "story" }, { name: "needs-triage" }] }] },
    /needs-triage/,
  );
}

test("US-DEV-08: the branches of a standard fetch come from the remote-tracking refs, the main and dev branches excluded", async () => {
  const client = fake({ trackedRefs: true, branches: "sha1\trefs/heads/feat/xyz-01-a\n" });
  const result = await claim(client, 62, quiet);
  assert.equal(result.branch, "feat/bes-06-delete-specimen");
  assert.ok(client.calls.some((c) => c.startsWith("git for-each-ref")));
});

test("US-DEV-08: losing the race for the assignee steps back and deletes its own branch", async () => {
  const client = fake({ raceWith: "konradhe14" });
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
  assert.ok(!client.calls.some((c) => /--delete/.test(c)), "the branch was never ours to delete");
});

test("US-DEV-08: a push whose answer was lost is undone, because origin shows our claim commit", async () => {
  const client = fake({ pushApplies: true });
  await assert.rejects(claim(client, 62, quiet), /connection reset after the push/);
  assert.ok(
    client.calls.some((c) => /git push origin --delete feat\/bes-06-delete-specimen/.test(c)),
  );
  assert.ok(!client.calls.some((c) => /-X POST/.test(c)), "nothing was assigned");
});

test("US-DEV-08: an assignee answer lost after GitHub applied it is undone", async () => {
  const client = fake({ assignApplies: true });
  await assert.rejects(claim(client, 62, quiet), /connection reset/);
  assert.ok(client.calls.some((c) => /-X DELETE repos\/.*\/issues\/62\/assignees/.test(c)));
  assert.ok(
    client.calls.some((c) => /git push origin --delete feat\/bes-06-delete-specimen/.test(c)),
  );
});

test("US-DEV-08: a branch that origin holds with another commit is never deleted by an undo", async () => {
  const client = fake({ branches: "other999\trefs/heads/feat/bes-06-delete-specimen\n" });
  const note = await deleteClaimBranch(client, "feat/bes-06-delete-specimen", "abc123");
  assert.match(note, /left alone/);
  assert.ok(!client.calls.some((c) => /--delete/.test(c)));
});

test("US-DEV-08: a failing PR creation rolls back assignee, status and branch", async () => {
  const client = fake({ prFails: true });
  await assert.rejects(claim(client, 62, quiet), /gh down/);
  const all = client.calls.join("\n");
  assert.match(all, /-X DELETE repos\/PflanzenDex\/PflanzenDex\/issues\/62\/assignees/);
  assert.match(all, /git push origin --delete feat\/bes-06-delete-specimen/);
  assert.ok(
    client.calls.some(
      (c) => c.includes("updateProjectV2ItemFieldValue") && c.includes("-f option=T"),
    ),
    "the status goes back to Todo",
  );
});

test("US-DEV-08: an undo step that fails once is tried again, and the rollback reports no warning", async () => {
  const logs = [];
  const client = fake({ prFails: true, undoFails: 1 });
  await assert.rejects(claim(client, 62, { log: (l) => logs.push(l), retryDelayMs: 0 }), /gh down/);
  assert.equal(client.calls.filter((c) => /-X DELETE .*assignees/.test(c)).length, 2);
  assert.ok(logs.some((l) => /Rolled back: assignee of #62/.test(l)));
  assert.ok(!logs.some((l) => /WARNING/.test(l)));
});

test("US-DEV-08: an undo step that keeps failing prints the command to run by hand (P-10)", async () => {
  const logs = [];
  const client = fake({ prFails: true, undoAlwaysFails: true });
  await assert.rejects(claim(client, 62, { log: (l) => logs.push(l), retryDelayMs: 0 }), /gh down/);
  assert.equal(client.calls.filter((c) => /-X DELETE .*assignees/.test(c)).length, 3);
  assert.ok(
    logs.some((l) =>
      /WARNING: could not roll back "assignee of #62".*undo it by hand: gh api -X DELETE repos\/PflanzenDex\/PflanzenDex\/issues\/62\/assignees -f assignees\[\]=max/.test(
        l,
      ),
    ),
  );
});

test("US-DEV-08: after a claim is undone, the same claim runs again", async () => {
  await assert.rejects(claim(fake({ prFails: true }), 62, quiet), /gh down/);
  const result = await claim(fake(), 62, quiet);
  assert.equal(result.branch, "feat/bes-06-delete-specimen");
});

test("US-DEV-08: each step of a claim is announced before it runs, so a hung call is visible", async () => {
  const logs = [];
  await claim(fake(), 62, { log: (l) => logs.push(l), retryDelayMs: 0 });
  for (const step of [
    "claim: fetching origin",
    "claim: reading #62",
    "claim: pushing origin/feat/bes-06-delete-specimen",
    "claim: assigning #62",
    "claim: setting the project status",
    "claim: opening the draft PR",
  ]) {
    assert.ok(
      logs.some((l) => l.startsWith(step)),
      `no progress line for: ${step}`,
    );
  }
  assert.ok(logs.some((l) => /^claim: done in \d+ s$/.test(l)));
});

test("US-DEV-08: the status of an issue already on the board is set on its item, without a second item write", async () => {
  const client = fake({
    board: { items: [{ id: "I", content: { number: 62 }, status: "Todo", priority: "P1" }] },
  });
  await claim(client, 62, quiet);
  assert.ok(!client.calls.some((c) => c.includes("addProjectV2ItemById")));
  assert.ok(
    client.calls.some(
      (c) => c.includes("updateProjectV2ItemFieldValue") && c.includes("-f item=I "),
    ),
  );
});

test("US-DEV-08: a re-run after a half claim of the caller continues", async () => {
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
  const result = await claim(fake(), 62, { log: (l) => lines.push(l), retryDelayMs: 0 });
  assert.equal(result.branch, "feat/bes-06-delete-specimen");
  assert.ok(lines.some((l) => /could not read the board type of #62/.test(l)));
});

test("US-DEV-08: the claim's push runs under the push limit; every other call of the claim keeps the default limit", async () => {
  const client = fake();
  await claim(client, 62, quiet);
  const limited = client.limits.filter((c) => c.limit !== undefined);
  assert.deepEqual(limited, [
    {
      line: "git push origin abc123:refs/heads/feat/bes-06-delete-specimen",
      limit: PUSH_LIMIT,
    },
  ]);
});

test("US-DEV-08: the undo's push --delete runs under the push limit too, because the pre-push hook runs on a delete", async () => {
  const client = fake({ raceWith: "konradhe14" });
  await assert.rejects(claim(client, 62, quiet), /claimed #62 first/);
  const remove = client.limits.find((c) => c.line.startsWith("git push origin --delete"));
  assert.equal(remove?.limit, PUSH_LIMIT);
  assert.ok(
    client.limits
      .filter((c) => c.limit !== undefined)
      .every((c) => c.line.startsWith("git push origin ")),
    "only git push calls carry the push limit",
  );
});

test("US-DEV-08: CLAIM_TIMEOUT_S (60 s) and CLAIM_PUSH_TIMEOUT_S (300 s) are the starting values; a value that is not a positive number is refused", () => {
  assert.deepEqual(timeoutsOf({}), { timeoutMs: 60_000, limits: { [PUSH_LIMIT]: 300_000 } });
  assert.deepEqual(timeoutsOf({ CLAIM_TIMEOUT_S: "30", CLAIM_PUSH_TIMEOUT_S: "500" }), {
    timeoutMs: 30_000,
    limits: { [PUSH_LIMIT]: 500_000 },
  });
  assert.throws(
    () => timeoutsOf({ CLAIM_PUSH_TIMEOUT_S: "soon" }),
    /CLAIM_PUSH_TIMEOUT_S must be a positive number of seconds/,
  );
  assert.throws(
    () => timeoutsOf({ CLAIM_TIMEOUT_S: "0" }),
    /CLAIM_TIMEOUT_S must be a positive number of seconds/,
  );
});
