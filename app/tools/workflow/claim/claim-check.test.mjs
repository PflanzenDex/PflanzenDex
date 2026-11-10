// US-DEV-08: branch-based claim checks (make worktree) and the handoff text; US-DEV-05 (issue 1747): the handoff skeleton
import test from "node:test";
import assert from "node:assert/strict";
import { checkBranch, run } from "./claim-check.mjs";
import { lessonsProblems } from "../../check/docs/agents/pr/pr-lessons.mjs";
import { handoffBody } from "./lib/writes/claim-steps.mjs";

// Fake gh: the repository name, the user and the open issues (REST shape, FR-DEV-10 #1412) are answered by route.
function client(issues, { offline = false } = {}) {
  return {
    async run(cmd, args) {
      if (offline) throw new Error("network down\nmore");
      if (args.some((a) => a.includes("{owner}/{repo}"))) return "PflanzenDex/PflanzenDex\n";
      if (args[1] === "user") return "max\n";
      return JSON.stringify(
        issues.map((i) => ({ ...i, state: "open", labels: [], html_url: "", updated_at: "" })),
      );
    },
  };
}
const issue = (assignees) => ({
  number: 62,
  title: "US-BES-06 · Delete specimen",
  assignees: assignees.map((login) => ({ login })),
});

test("US-DEV-08: a branch without story ID passes without asking GitHub", async () => {
  const v = await checkBranch(client([], { offline: true }), "feat/gate-global-reference");
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
    { number: 62, title: "US-BES-06 · Delete specimen", url: "https://x/62" },
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

test("US-DEV-08: the handoff carries a reserved migration number only when one is given", () => {
  const issue = { number: 62, title: "US-BES-06 · Delete specimen", url: "https://x/62" };
  assert.doesNotMatch(handoffBody(issue, "feat/bes-06-x", "max"), /Migration number/);
  assert.match(
    handoffBody(issue, "feat/bes-06-x", "max", "0067"),
    /\*\*Migration number:\*\* 0067/,
  );
});

test("US-DEV-05: the handoff skeleton carries State, Open and Owner decisions and the Worktree, before the test evidence", () => {
  const body = handoffBody(
    { number: 62, title: "US-BES-06 · Delete specimen", url: "https://x/62" },
    "feat/bes-06-x",
    "max",
  );
  const handoff = body.slice(body.indexOf("## Handoff"), body.indexOf("## Test evidence"));
  for (const part of ["**State:**", "**Open decisions:**", "**Owner decisions:**"]) {
    assert.ok(handoff.includes(part), part);
  }
  assert.ok(
    handoff.includes(
      "- **Worktree:** `.worktrees/feat-bes-06-x` (ports and test database in its `.env.worktree`)",
    ),
    "the worktree is the branch with / replaced by -",
  );
});

test("US-DEV-05: the fresh draft has a Lessons placeholder that the Lessons check refuses until it is filled", () => {
  const body = handoffBody(
    { number: 62, title: "US-BES-06 · Delete specimen", url: "https://x/62" },
    "feat/bes-06-x",
    "max",
  );
  assert.ok(body.indexOf("## Lessons") > body.indexOf("## Test evidence"));
  assert.ok(body.indexOf("## Lessons") < body.indexOf("## AI involvement"));
  assert.equal(lessonsProblems(body).length, 1);
  assert.match(lessonsProblems(body)[0], /"## Lessons" section is empty/);
});
