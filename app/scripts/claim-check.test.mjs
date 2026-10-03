// US-DEV-08: branch-based claim checks (make worktree, pre-push) and the handoff text
import test from "node:test";
import assert from "node:assert/strict";
import { checkBranch, pushedBranches, run } from "./claim-check.mjs";
import { handoffBody } from "./claim-steps.mjs";

function client(issues, { offline = false } = {}) {
  return {
    async run(cmd, args) {
      if (offline) throw new Error("network down\nmore");
      if (args[0] === "api") return "max\n";
      return JSON.stringify(issues);
    },
  };
}
const issue = (assignees) => ({
  number: 62,
  title: "US-BES-06 · Exemplar löschen",
  assignees: assignees.map((login) => ({ login })),
});

test("US-DEV-08: a branch without story ID passes without asking GitHub", async () => {
  const v = await checkBranch(
    client([], { offline: true }),
    "feat/gate-global-referenz",
    "worktree",
  );
  assert.deepEqual(v, { ok: true, message: null });
});

test("US-DEV-08: a story claimed by somebody else is refused for worktree and push", async () => {
  for (const mode of ["worktree", "push"]) {
    const v = await checkBranch(client([issue(["konradhe14"])]), "feat/bes-06-x", mode);
    assert.equal(v.ok, false);
    assert.match(v.message, /belongs to @konradhe14/);
  }
});

test("US-DEV-08: my own claim passes", async () => {
  assert.equal((await checkBranch(client([issue(["max"])]), "feat/bes-06-x", "push")).ok, true);
});

test("US-DEV-08: an unclaimed story is refused for a worktree and only warned about on push", async () => {
  const wt = await checkBranch(client([issue([])]), "feat/bes-06-x", "worktree");
  assert.equal(wt.ok, false);
  assert.match(wt.message, /make claim ISSUE=62/);
  const push = await checkBranch(client([issue([])]), "feat/bes-06-x", "push");
  assert.equal(push.ok, true);
  assert.match(push.message, /warning/);
});

test("US-DEV-08: offline, the check warns and lets go", async () => {
  const v = await checkBranch(client([], { offline: true }), "feat/bes-06-x", "push");
  assert.equal(v.ok, true);
  assert.match(v.message, /skipped for BES-06: network down/);
});

test("US-DEV-08: pre-push stdin yields pushed branches, deletions are ignored", () => {
  const stdin = [
    "refs/heads/a aaa refs/heads/feat/bes-06-x bbb",
    "(delete) 0000000000 refs/heads/gone ccc",
    "",
  ].join("\n");
  assert.deepEqual(pushedBranches(stdin), ["feat/bes-06-x"]);
});

test("US-DEV-08: run aborts the push when one pushed branch belongs to somebody else", async () => {
  const messages = [];
  const stdin = "refs/heads/a aaa refs/heads/feat/bes-06-x bbb\n";
  const ok = await run(client([issue(["konradhe14"])]), ["pre-push"], stdin, (m) =>
    messages.push(m),
  );
  assert.equal(ok, false);
  assert.match(messages[0], /konradhe14/);
});

test("US-DEV-08: the handoff text has the four parts and closes the issue", () => {
  const body = handoffBody(
    { number: 62, title: "US-BES-06 · Exemplar löschen", url: "https://x/62" },
    "feat/bes-06-x",
    "max",
  );
  assert.match(body, /^Closes #62/);
  for (const part of [
    "## Handoff",
    "**Task:**",
    "**Done:**",
    "**Missing:**",
    "**Verification:**",
    "**Next steps:**",
  ]) {
    assert.ok(body.includes(part), part);
  }
});
