// Who the caller of the claim tools is, and whom a claim assigns (US-DEV-08, issue 2556). The agent may run as a GitHub App: its bot
// (`pflanzendex-agent[bot]`) cannot be an assignee, so a claim assigns and names the human of PFLANZENDEX_CLAIM_ASSIGNEE.
// REST `user` answers 403 to an App identity; `me` reads the GraphQL viewer then, the one GraphQL read of the claim tools (FR-DEV-10, #1412).
import { graphql } from "../calls/github-calls.mjs";

const viewers = new WeakMap(); // client -> the login of the caller, read once per run

/**
 * The login of the caller: a user, or the bot of a GitHub App (the agent, `pflanzendex-agent[bot]`). REST `user` answers 403 to an
 * App identity, so the GraphQL viewer answers instead. Read once per run.
 */
export function me(client) {
  if (!viewers.has(client)) viewers.set(client, readViewer(client));
  return viewers.get(client);
}

async function readViewer(client) {
  let restProblem = "no login";
  try {
    const login = (await client.run("gh", ["api", "user", "-q", ".login"])).trim();
    if (login) return login;
  } catch (e) {
    restProblem = firstLine(e);
  }
  let graphqlProblem = "no login";
  try {
    const login = (await graphql(client, "{ viewer { login } }")).viewer?.login;
    if (login) return login;
  } catch (e) {
    graphqlProblem = firstLine(e);
  }
  throw new Error(
    `could not read the login of the caller: gh api user (${restProblem}); GraphQL viewer (${graphqlProblem})`,
  );
}

const firstLine = (e) => String(e.message ?? e).split("\n")[0];

/** Whether a login is the bot of a GitHub App: a bot cannot be an assignee (US-DEV-08, issue 2556). */
export const isBot = (login) => String(login ?? "").endsWith("[bot]");

/**
 * Who a claim assigns and names: the login from PFLANZENDEX_CLAIM_ASSIGNEE when it is set (the responsible human, when the agent runs
 * as a bot), else the caller when the caller is a user. A bot without the setting is refused before any write (US-DEV-08, issue 2556).
 */
export async function claimant(client, env = process.env) {
  const configured = String(env.PFLANZENDEX_CLAIM_ASSIGNEE ?? "").trim();
  if (isBot(configured)) {
    throw new Error(
      `PFLANZENDEX_CLAIM_ASSIGNEE names the bot ${configured}: a bot cannot be assigned; set it to the responsible human's login`,
    );
  }
  if (configured) return configured;
  const login = await me(client);
  if (isBot(login)) {
    throw new Error(
      `the agent runs as ${login}, a bot cannot be assigned: set PFLANZENDEX_CLAIM_ASSIGNEE to the responsible human's login`,
    );
  }
  return login;
}
