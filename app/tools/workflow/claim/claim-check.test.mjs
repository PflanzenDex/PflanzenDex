// US-DEV-08: branch-based claim checks (make worktree) and the handoff text; US-DEV-05 (issue 1747): the handoff skeleton
import test from "node:test";
import assert from "node:assert/strict";
import { checkBranch, run } from "./claim-check.mjs";
import { lessonsProblems } from "../../check/docs/agents/pr/pr-lessons.mjs";
import { handoffBody } from "./lib/writes/claim-steps.mjs";

const APP_BOT = "pflanzendex-agent[bot]";
const NO_ENV = {}; // every check gets its environment explicitly, so a shell with the setting cannot change a test
const SETTING = { PFLANZENDEX_CLAIM_ASSIGNEE: "konradhe14" };

// Fake gh: the repository name, the identity and the open issues (REST shape, FR-DEV-10 #1412) are answered by route.
// `user` is the login of the REST user; `restUserFails` makes that call fail as it does for a GitHub App (HTTP 403);
// `viewer` is the login the GraphQL viewer answers (the bot of an App, or the user).
function client(
  issues,
  { offline = false, user = "max", restUserFails = false, viewer = user } = {},
) {
  return {
    async run(cmd, args) {
      if (offline) throw new Error("network down\nmore");
      if (args.some((a) => a.includes("{owner}/{repo}"))) return "PflanzenDex/PflanzenDex\n";
      if (args[1] === "user") {
        if (restUserFails) throw new Error("gh: Resource not accessible by integration (HTTP 403)");
        return `${user}\n`;
      }
      if (args[1] === "graphql") return JSON.stringify({ data: { viewer: { login: viewer } } });
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
  const v = await checkBranch(client([], { offline: true }), "feat/gate-global-reference", NO_ENV);
  assert.deepEqual(v, { ok: true, message: null });
});

test("US-DEV-08: an issue claimed by somebody else is refused for a worktree", async () => {
  const v = await checkBranch(client([issue(["konradhe14"])]), "feat/issue-62-x", NO_ENV);
  assert.equal(v.ok, false);
  assert.match(v.message, /belongs to @konradhe14/);
});

test("US-DEV-08: my own claim passes", async () => {
  assert.equal((await checkBranch(client([issue(["max"])]), "feat/issue-62-x", NO_ENV)).ok, true);
});

test("US-DEV-08: a user viewer without the setting is the claimant: an issue assigned to them passes, another login is refused", async () => {
  assert.deepEqual(await checkBranch(client([issue(["max"])]), "feat/issue-62-x", NO_ENV), {
    ok: true,
    message: null,
  });
  const other = await checkBranch(client([issue(["anna"])]), "feat/issue-62-x", NO_ENV);
  assert.equal(other.ok, false);
  assert.match(other.message, /belongs to @anna/);
});

test("US-DEV-08: the agent as a GitHub App (REST user 403, GraphQL viewer is the bot) passes an issue assigned to the human of PFLANZENDEX_CLAIM_ASSIGNEE", async () => {
  const v = await checkBranch(
    client([issue(["konradhe14"])], { restUserFails: true, viewer: APP_BOT }),
    "feat/issue-62-x",
    SETTING,
  );
  assert.deepEqual(v, { ok: true, message: null });
});

test("US-DEV-08: the agent as a GitHub App refuses an issue assigned to someone else, and names them", async () => {
  const v = await checkBranch(
    client([issue(["anna"])], { restUserFails: true, viewer: APP_BOT }),
    "feat/issue-62-x",
    SETTING,
  );
  assert.equal(v.ok, false);
  assert.match(v.message, /belongs to @anna/);
});

test("US-DEV-08: the agent as a GitHub App without the setting passes with the skip message that names the setting, it does not refuse", async () => {
  const v = await checkBranch(
    client([issue(["konradhe14"])], { restUserFails: true, viewer: APP_BOT }),
    "feat/issue-62-x",
    NO_ENV,
  );
  assert.equal(v.ok, true);
  assert.match(
    v.message,
    /claim check skipped for ISSUE-62: the agent runs as pflanzendex-agent\[bot\], a bot cannot be assigned: set PFLANZENDEX_CLAIM_ASSIGNEE/,
  );
});

test("US-DEV-08: the setting overrides a user viewer: the named human is ours, and the viewer counts as ours too", async () => {
  const mine = await checkBranch(client([issue(["konradhe14"])]), "feat/issue-62-x", SETTING);
  assert.deepEqual(mine, { ok: true, message: null });
  const viewerToo = await checkBranch(client([issue(["max"])]), "feat/issue-62-x", SETTING);
  assert.equal(viewerToo.ok, true);
  const foreign = await checkBranch(client([issue(["anna"])]), "feat/issue-62-x", SETTING);
  assert.equal(foreign.ok, false);
  assert.match(foreign.message, /belongs to @anna/);
});

test("US-DEV-08: an unclaimed issue is refused for a worktree", async () => {
  const v = await checkBranch(client([issue([])]), "feat/issue-62-x", NO_ENV);
  assert.equal(v.ok, false);
  assert.match(v.message, /make claim ISSUE=62/);
});

test("US-DEV-08: offline, the check warns and lets go", async () => {
  const v = await checkBranch(client([], { offline: true }), "feat/issue-62-x", NO_ENV);
  assert.equal(v.ok, true);
  assert.match(v.message, /skipped for ISSUE-62: .*network down/);
});

test("US-DEV-08: a branch with only a story ID is not checked and asks GitHub nothing, the ID may belong to many issues", async () => {
  const v = await checkBranch(client([], { offline: true }), "feat/bes-06-x", NO_ENV);
  assert.equal(v.ok, true);
  assert.match(v.message, /carries no issue number/);
});

test("US-DEV-08: run reports the verdict of a foreign issue", async () => {
  const messages = [];
  const ok = await run(
    client([issue(["konradhe14"])]),
    "feat/issue-62-x",
    (m) => messages.push(m),
    NO_ENV,
  );
  assert.equal(ok, false);
  assert.match(messages[0], /konradhe14/);
});

test("US-DEV-08: run takes the environment too: the agent's claim of the named human passes, silently", async () => {
  const messages = [];
  const ok = await run(
    client([issue(["konradhe14"])], { restUserFails: true, viewer: APP_BOT }),
    "feat/issue-62-x",
    (m) => messages.push(m),
    SETTING,
  );
  assert.equal(ok, true);
  assert.deepEqual(messages, []);
});

test("US-DEV-08: the handoff text starts with Refs #n, carries the Closes hint and never closes the issue itself", () => {
  const body = handoffBody(
    { number: 62, title: "US-BES-06 · Delete specimen", url: "https://x/62" },
    "feat/bes-06-x",
    "max",
  );
  assert.match(body, /^Refs #62\n/);
  assert.match(
    body,
    /<!--[^]*Closes #<n>[^]*-->/,
    "the hint to switch to Closes when the PR finishes",
  );
  assert.doesNotMatch(body, /Closes #\d/, "a claim draft must not close the issue on merge");
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
