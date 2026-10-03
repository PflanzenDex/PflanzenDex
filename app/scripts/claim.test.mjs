// US-DEV-08: `make claim` with an injected gh/git client
import test from "node:test";
import assert from "node:assert/strict";
import { claim, ClaimRefused } from "./claim.mjs";

const issue = {
  number: 62,
  title: "US-BES-06 · Delete specimen",
  state: "OPEN",
  url: "https://github.com/o/r/issues/62",
  labels: [{ name: "story" }],
  assignees: [],
};

// Fake client: answers by the first matching rule on "cmd arg arg ..."; records every call.
function fake({ issues = [issue], prs = [], branches = "", pushFails = false } = {}) {
  const calls = [];
  let views = 0;
  return {
    calls,
    async run(cmd, args) {
      const line = `${cmd} ${args.join(" ")}`;
      calls.push(line);
      if (line.startsWith("gh issue view"))
        return JSON.stringify(issues[Math.min(views++, issues.length - 1)]);
      if (line.startsWith("gh pr list")) return JSON.stringify(prs);
      if (line.startsWith("git ls-remote")) return branches;
      if (line.startsWith("gh api user")) return "max\n";
      if (line.startsWith("gh repo view")) return "PflanzenDex\n";
      if (line.startsWith("gh project item-add")) return JSON.stringify({ id: "ITEM" });
      if (line.startsWith("gh project field-list"))
        return JSON.stringify({
          fields: [{ id: "F", name: "Status", options: [{ id: "O", name: "In Progress" }] }],
        });
      if (line.startsWith("gh project view")) return JSON.stringify({ id: "PROJ" });
      if (line.startsWith("git rev-parse")) return "tree\n";
      if (line.startsWith("git commit-tree")) return "abc123\n";
      if (line.startsWith("git push") && pushFails) throw new Error("rejected");
      if (line.startsWith("gh pr create")) return "https://github.com/o/r/pull/9\n";
      return "";
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

test("US-DEV-08: losing the race for the assignee steps back and writes no branch", async () => {
  const taken = { ...issue, assignees: [{ login: "konradhe14" }] };
  const client = fake({ issues: [issue, taken] });
  await assert.rejects(claim(client, 62, quiet), /claimed #62 first/);
  assert.ok(client.calls.some((c) => c.includes("--remove-assignee")));
  assert.ok(!client.calls.some((c) => c.startsWith("git push")));
});

test("US-DEV-08: the draft PR title carries type, epic scope and story ID", async () => {
  const client = fake();
  await claim(client, 62, quiet);
  const create = client.calls.find((c) => c.startsWith("gh pr create"));
  assert.match(create, /--title feat\(bes\): delete specimen \(US-BES-06\)/);
});
