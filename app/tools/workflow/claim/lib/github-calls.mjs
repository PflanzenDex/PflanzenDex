// The transport of the claim tools (US-DEV-08, #1487): how a gh or git call is made, paged and checked. Tests inject a fake with the
// same shape: { run(cmd, args) -> Promise<string> }. The domain reads and writes are in claim-client.mjs and board-client.mjs.
// A real call may get a time limit (realClient timeoutMs, set by make claim): a call that does not answer ends with an error that
// names it, so the claim undoes its writes instead of waiting in silence.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export function realClient({ cwd = process.cwd(), timeoutMs } = {}) {
  return {
    async run(cmd, args) {
      try {
        const { stdout } = await exec(cmd, args, {
          cwd,
          maxBuffer: 32 * 1024 * 1024,
          ...(timeoutMs ? { timeout: timeoutMs } : {}),
        });
        return stdout;
      } catch (e) {
        if (timeoutMs && e.killed) {
          throw new Error(
            `${cmd} ${args.slice(0, 2).join(" ")} did not answer within ${timeoutMs / 1000} s (network or GitHub too slow); run it again`,
            { cause: e },
          );
        }
        throw e;
      }
    },
  };
}

export async function json(client, args) {
  return JSON.parse(await client.run("gh", args));
}

/** One GraphQL call through `gh api graphql`; a GraphQL error (also inside an HTTP 200 body) throws with its message. */
export async function graphql(client, query, vars = {}) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [name, value] of Object.entries(vars)) {
    if (value !== undefined && value !== null) args.push("-F", `${name}=${value}`);
  }
  const body = await json(client, args);
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return body.data;
}

/**
 * A GraphQL call whose variables are all strings (ids and option ids). They go with -f: gh's -F would turn an option id made
 * of digits into a number, and GraphQL would refuse it.
 */
export async function graphqlIds(client, query, vars = {}) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [name, value] of Object.entries(vars)) args.push("-f", `${name}=${value}`);
  const body = await json(client, args);
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return body.data;
}

/** Up to `max` items of a paged REST list (100 per page); `path` may already carry a query string. */
export async function restList(client, path, max) {
  const sep = path.includes("?") ? "&" : "?";
  const out = [];
  for (let page = 1; out.length < max; page += 1) {
    const batch = await json(client, ["api", `${path}${sep}per_page=100&page=${page}`]);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out.slice(0, max);
}

/**
 * Up to `max` items of a paged REST list, every page asked for at once (100 per page): one round trip instead of one per page.
 * A page past the end comes back empty, so at most one request more than the list needs (#1487).
 */
export async function restPages(client, path, max) {
  const sep = path.includes("?") ? "&" : "?";
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(max / 100) }, (_, i) =>
      json(client, ["api", `${path}${sep}per_page=100&page=${i + 1}`]),
    ),
  );
  const out = [];
  for (const batch of pages) {
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out.slice(0, max);
}
