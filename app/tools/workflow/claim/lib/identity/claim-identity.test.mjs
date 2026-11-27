// US-DEV-08 (issue 2556): the caller's login over REST or the GraphQL viewer (a GitHub App), and the claimant a claim assigns
import test from "node:test";
import assert from "node:assert/strict";
import { claimant, isBot, me } from "./claim-identity.mjs";

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

const APP_BOT = "pflanzendex-agent[bot]";
const HTTP_403 = "gh: Resource not accessible by integration (HTTP 403)";
const denied = () => {
  throw new Error(HTTP_403);
};
const userClient = (login) => fakeGh([["gh api user", `${login}\n`]]);
// The agent as a GitHub App: REST user answers 403, GraphQL viewer names the bot.
const appClient = (login = APP_BOT) =>
  fakeGh([
    ["gh api user", denied],
    ["gh api graphql", JSON.stringify({ data: { viewer: { login } } })],
  ]);

test("US-DEV-08: me reads the user login over REST, without a GraphQL call", async () => {
  const client = fakeGh([
    ["gh api user", "max\n"],
    ["gh api graphql", () => assert.fail("GraphQL must not be asked when REST answers")],
  ]);
  assert.equal(await me(client), "max");
  assert.equal(client.calls.length, 1);
});

test("US-DEV-08: an App identity gets 403 on the REST user, so me falls back to the GraphQL viewer and reads the bot login", async () => {
  const client = appClient();
  assert.equal(await me(client), APP_BOT);
  assert.ok(client.calls.includes("gh api graphql -f query={ viewer { login } }"));
});

test("US-DEV-08: me names both failures when the REST user and the GraphQL viewer fail, it never returns an empty login", async () => {
  const client = fakeGh([
    ["gh api user", denied],
    [
      "gh api graphql",
      () => {
        throw new Error("API rate limit exceeded");
      },
    ],
  ]);
  await assert.rejects(
    me(client),
    /could not read the login of the caller: gh api user \(gh: Resource not accessible by integration \(HTTP 403\)\); GraphQL viewer \(API rate limit exceeded\)/,
  );
});

test("US-DEV-08: a GraphQL viewer answer with errors throws with its message, not an empty login", async () => {
  const client = fakeGh([
    ["gh api user", denied],
    [
      "gh api graphql",
      JSON.stringify({
        data: null,
        errors: [{ message: "Resource not accessible by integration" }],
      }),
    ],
  ]);
  await assert.rejects(me(client), /GraphQL viewer \(Resource not accessible by integration\)/);
});

test("US-DEV-08: a viewer without a login (null) and an empty REST answer throw, they never return an empty login", async () => {
  const client = fakeGh([
    ["gh api user", "\n"],
    ["gh api graphql", '{"data":{"viewer":null}}'],
  ]);
  await assert.rejects(me(client), /gh api user \(no login\); GraphQL viewer \(no login\)/);
});

test("US-DEV-08: me is read once per run: the claim and the claim check share the answer", async () => {
  const client = userClient("max");
  await me(client);
  await me(client);
  await claimant(client, {});
  assert.equal(client.calls.filter((c) => c.startsWith("gh api user")).length, 1);
});

test("US-DEV-08: isBot tells the bot of a GitHub App (login ending in [bot]) from a user", () => {
  assert.equal(isBot(APP_BOT), true);
  assert.equal(isBot("max"), false);
  assert.equal(isBot("botanik"), false);
  assert.equal(isBot(undefined), false);
});

test("US-DEV-08: claimant is the user viewer when no setting is given", async () => {
  assert.equal(await claimant(userClient("max"), {}), "max");
});

test("US-DEV-08: the setting PFLANZENDEX_CLAIM_ASSIGNEE, trimmed, is the claimant and overrides a user viewer", async () => {
  assert.equal(
    await claimant(userClient("max"), { PFLANZENDEX_CLAIM_ASSIGNEE: "  konradhe14 \n" }),
    "konradhe14",
  );
});

test("US-DEV-08: a blank setting is no setting: the user viewer stays the claimant", async () => {
  assert.equal(await claimant(userClient("max"), { PFLANZENDEX_CLAIM_ASSIGNEE: "   " }), "max");
});

test("US-DEV-08: the setting answers without asking GitHub, also for a bot viewer", async () => {
  const client = fakeGh([]);
  assert.equal(await claimant(client, { PFLANZENDEX_CLAIM_ASSIGNEE: "konradhe14" }), "konradhe14");
  assert.equal(client.calls.length, 0);
  assert.equal(
    await claimant(appClient(), { PFLANZENDEX_CLAIM_ASSIGNEE: "konradhe14" }),
    "konradhe14",
  );
});

test("US-DEV-08: a bot viewer without the setting makes the claimant throw with the instruction for the human", async () => {
  await assert.rejects(
    claimant(appClient(), {}),
    (e) =>
      e.message ===
      "the agent runs as pflanzendex-agent[bot], a bot cannot be assigned: set PFLANZENDEX_CLAIM_ASSIGNEE to the responsible human's login",
  );
});

test("US-DEV-08: a setting that names a bot is refused, a bot cannot be assigned", async () => {
  await assert.rejects(
    claimant(userClient("max"), { PFLANZENDEX_CLAIM_ASSIGNEE: APP_BOT }),
    /names the bot pflanzendex-agent\[bot\]: a bot cannot be assigned/,
  );
});
