// US-DEV-08: `make claim` with an injected gh/git client
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

// Fake client: answers by the first matching rule on "cmd arg arg ..."; records every call.
function fake({
  issues = [issue],
  prs = [],
  branches = "",
  pushFails = false,
  prFails = false,
} = {}) {
  const calls = [];
  let views = 0;
  const fields = {
    fields: [
      {
        id: "F",
        name: "Status",
        options: [
          { id: "O", name: "In Progress" },
          { id: "T", name: "Todo" },
        ],
      },
    ],
  };
  const fail = (message) => () => {
    throw new Error(message);
  };
  const rules = [
    ["gh issue view", () => JSON.stringify(issues[Math.min(views++, issues.length - 1)])],
    ["gh pr list", () => JSON.stringify(prs)],
    ["git ls-remote", () => branches],
    ["gh api user", () => "max\n"],
    ["gh repo view", () => "PflanzenDex\n"],
    ["gh project item-add", () => JSON.stringify({ id: "ITEM" })],
    ["gh project field-list", () => JSON.stringify(fields)],
    ["gh project view", () => JSON.stringify({ id: "PROJ" })],
    ["git rev-parse", () => "tree\n"],
    ["git commit-tree", () => "abc123\n"],
    ["git push origin --delete", () => ""],
    ["git push", pushFails ? fail("rejected") : () => ""],
    ["gh pr create", prFails ? fail("gh down") : () => "https://github.com/o/r/pull/9\n"],
  ];
  return {
    calls,
    async run(cmd, args) {
      const line = `${cmd} ${args.join(" ")}`;
      calls.push(line);
      const rule = rules.find(([prefix]) => line.startsWith(prefix));
      return rule ? rule[1]() : "";
    },
  };
}

const quiet = { log() {} };

test("US-DEV-08: a free story is assigned, set In Progress, pushed and opened as draft PR", async () => {
  const client = fake();
  const result = await claim(client, 62, quiet);
  assert.equal(result.branch, "feat/bes-06-delete-specimen");
  const all = client.calls.join("\n");
  assert.match(all, /gh issue edit 62 --add-assignee @me/);
  assert.match(
    all,
    /gh project item-edit --id ITEM --project-id PROJ --field-id F --single-select-option-id O/,
  );
  assert.match(all, /git push origin abc123:refs\/heads\/feat\/bes-06-delete-specimen/);
  assert.match(all, /gh pr create --draft --base dev --head feat\/bes-06-delete-specimen/);
  assert.doesNotMatch(all, /--no-verify|--force/);
  assert.ok(client.calls.every((c) => !c.startsWith("gh issue view") || c.includes("--json")));
});

test("US-DEV-08: an assigned issue is refused and nothing is written", async () => {
  const client = fake({ issues: [{ ...issue, assignees: [{ login: "konradhe14" }] }] });
  await assert.rejects(
    claim(client, 62, quiet),
    (e) => e instanceof ClaimRefused && /@konradhe14/.test(e.message),
  );
  assert.ok(!client.calls.some((c) => /issue edit|git push|pr create/.test(c)));
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
  assert.ok(client.calls.some((c) => c.includes("--remove-assignee")));
  assert.ok(
    client.calls.some((c) => /git push origin --delete feat\/bes-06-delete-specimen/.test(c)),
  );
  assert.ok(!client.calls.some((c) => c.startsWith("gh pr create")));
});

test("US-DEV-08: the branch is pushed before the issue is assigned", async () => {
  const client = fake();
  await claim(client, 62, quiet);
  const at = (re) => client.calls.findIndex((c) => re.test(c));
  assert.ok(at(/^git push origin abc123/) < at(/--add-assignee/));
});

test("US-DEV-08: a failing push leaves no assignee behind and writes nothing", async () => {
  const client = fake({ pushFails: true });
  await assert.rejects(claim(client, 62, quiet), /rejected/);
  assert.ok(!client.calls.some((c) => /issue edit|pr create/.test(c)));
});

test("US-DEV-08: a failing PR creation rolls back assignee, status and branch", async () => {
  const client = fake({ prFails: true });
  await assert.rejects(claim(client, 62, quiet), /gh down/);
  const all = client.calls.join("\n");
  assert.match(all, /--remove-assignee @me/);
  assert.match(all, /git push origin --delete feat\/bes-06-delete-specimen/);
  assert.match(all, /item-edit .*--single-select-option-id T/);
});

test("US-DEV-08: re-running after a half claim of the caller continues", async () => {
  const mine = { ...issue, assignees: [{ login: "max" }] };
  const result = await claim(fake({ issues: [mine] }), 62, quiet);
  assert.equal(result.branch, "feat/bes-06-delete-specimen");
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
  assert.ok(!client.calls.some((c) => /issue edit|git push|pr create/.test(c)));
});

test("US-DEV-08: the draft PR title carries type, epic scope and story ID", async () => {
  const client = fake();
  await claim(client, 62, quiet);
  const create = client.calls.find((c) => c.startsWith("gh pr create"));
  assert.match(create, /--title feat\(bes\): delete specimen \(US-BES-06\)/);
});
