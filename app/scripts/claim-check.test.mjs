// US-DEV-08: branch-based claim checks (make worktree) and the handoff text
import test from "node:test";
import assert from "node:assert/strict";
import { checkBranch, run } from "./claim-check.mjs";
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
  const v = await checkBranch(client([], { offline: true }), "feat/gate-global-referenz");
  assert.deepEqual(v, { ok: true, message: null });
});

test("US-DEV-08: a story claimed by somebody else is refused for a worktree", async () => {
  const v = await checkBranch(client([issue(["konradhe14"])]), "feat/bes-06-x");
  assert.equal(v.ok, false);
  assert.match(v.message, /belongs to @konradhe14/);
});

test("US-DEV-08: my own claim passes", async () => {
  assert.equal((await checkBranch(client([issue(["max"])]), "feat/bes-06-x")).ok, true);
});

test("US-DEV-08: an unclaimed story is refused for a worktree", async () => {
  const v = await checkBranch(client([issue([])]), "feat/bes-06-x");
  assert.equal(v.ok, false);
  assert.match(v.message, /make claim ISSUE=62/);
});

test("US-DEV-08: offline, the check warns and lets go", async () => {
  const v = await checkBranch(client([], { offline: true }), "feat/bes-06-x");
  assert.equal(v.ok, true);
  assert.match(v.message, /skipped for BES-06: network down/);
});

test("US-DEV-08: run reports the verdict of a foreign story", async () => {
  const messages = [];
  const ok = await run(client([issue(["konradhe14"])]), "feat/bes-06-x", (m) => messages.push(m));
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
