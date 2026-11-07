// FR-DEV-10 (#1412): the repository, issue and pull request reads use REST, and a GraphQL error is never an empty answer
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CallTimeout,
  createIssueRest,
  fetchBranches,
  fetchIssue,
  fetchOpenIssues,
  fetchPrs,
  graphql,
  graphqlIds,
  PUSH_LIMIT,
  realClient,
  setAssignee,
} from "./claim-client.mjs";
import { pushClaimBranch } from "./writes/claim-steps.mjs";

const REPO = "PflanzenDex/PflanzenDex";

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

const page = (n, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({
    number: i + 1,
    title: `PR ${i + 1}`,
    state: "open",
    ...extra,
  }));

test("FR-DEV-10: fetchIssue reads the issue over REST in the shape the claim rules read", async () => {
  const client = fakeGh([
    [
      `gh api repos/${REPO}/issues/62`,
      JSON.stringify({
        number: 62,
        title: "T",
        state: "closed",
        html_url: "https://github.com/o/r/issues/62",
        labels: [{ name: "story" }],
        assignees: [{ login: "max" }],
      }),
    ],
    ["gh api repos/{owner}/{repo}", `${REPO}\n`],
  ]);
  const issue = await fetchIssue(client, 62);
  assert.equal(issue.state, "CLOSED");
  assert.equal(issue.url, "https://github.com/o/r/issues/62");
  assert.deepEqual(issue.assignees, [{ login: "max" }]);
});

test("FR-DEV-10: the repository name is read once per run, not once per call", async () => {
  const client = fakeGh([
    ["gh api repos/{owner}/{repo}", `${REPO}\n`],
    [`gh api repos/${REPO}/issues/1`, JSON.stringify({ number: 1, title: "T", state: "open" })],
  ]);
  await fetchIssue(client, 1);
  await fetchIssue(client, 1);
  assert.equal(client.calls.filter((c) => c.includes("{owner}/{repo}")).length, 1);
});

test("FR-DEV-10: fetchPrs pages over REST (100 per page) and keeps the 300 newest, mapped to the claim shape", async () => {
  const pages = [page(100), page(100), page(100), page(100)];
  const client = fakeGh([
    ["gh api repos/{owner}/{repo}", `${REPO}\n`],
    [
      `gh api repos/${REPO}/pulls?`,
      (line) => JSON.stringify(pages[Number(line.match(/&page=(\d+)/)[1]) - 1]),
    ],
  ]);
  const prs = await fetchPrs(client);
  assert.equal(prs.length, 300);
  assert.equal(
    client.calls.filter((c) => c.includes("/pulls?")).length,
    3,
    "three pages, not four",
  );
  const merged = await onePr({
    merged_at: "2026-11-01T00:00:00Z",
    state: "closed",
    draft: true,
    head: { ref: "feat/x" },
  });
  assert.equal(merged.state, "MERGED");
  assert.equal(merged.mergedAt, "2026-11-01T00:00:00Z");
  assert.equal(merged.isDraft, true);
  assert.equal(merged.headRefName, "feat/x");
  assert.equal((await onePr({ state: "closed", merged_at: null })).state, "CLOSED");
});

/** One pull request from the REST pulls route, mapped by fetchPrs. */
async function onePr(raw) {
  const client = fakeGh([
    ["gh api repos/{owner}/{repo}", `${REPO}\n`],
    [
      `gh api repos/${REPO}/pulls?`,
      JSON.stringify([{ number: 1, title: "T", body: null, ...raw }]),
    ],
  ]);
  return (await fetchPrs(client))[0];
}

test("FR-DEV-10: fetchOpenIssues leaves pull requests out of the REST issue list", async () => {
  const client = fakeGh([
    ["gh api repos/{owner}/{repo}", `${REPO}\n`],
    [
      `gh api repos/${REPO}/issues?`,
      JSON.stringify([
        { number: 7, title: "Issue", state: "open", labels: [], assignees: [] },
        { number: 8, title: "A pull request", state: "open", pull_request: {} },
      ]),
    ],
  ]);
  const issues = await fetchOpenIssues(client);
  assert.deepEqual(
    issues.map((i) => i.number),
    [7],
  );
});

test("FR-DEV-10: a GraphQL error throws with its message, it is never an empty answer (P-10)", async () => {
  const client = fakeGh([
    [
      "gh api graphql",
      JSON.stringify({ data: null, errors: [{ message: "API rate limit already exceeded" }] }),
    ],
  ]);
  await assert.rejects(
    graphql(client, "query { viewer { login } }"),
    /API rate limit already exceeded/,
  );
});

test("FR-DEV-10: createIssueRest posts the labels as an array and returns the number and URL", async () => {
  const client = fakeGh([
    ["gh api repos/{owner}/{repo}", `${REPO}\n`],
    [
      `gh api -X POST repos/${REPO}/issues`,
      JSON.stringify({ number: 1234, html_url: "https://github.com/o/r/issues/1234" }),
    ],
  ]);
  const created = await createIssueRest(client, {
    repo: REPO,
    title: "T",
    body: "B",
    labels: ["story", "epic:ACC"],
  });
  assert.deepEqual(created, { number: 1234, url: "https://github.com/o/r/issues/1234" });
  const post = client.calls.find((c) => c.includes("-X POST"));
  assert.match(post, /-f labels\[\]=story -f labels\[\]=epic:ACC/);
});

test("FR-DEV-10: setAssignee adds and removes one login over REST", async () => {
  const client = fakeGh([
    ["gh api repos/{owner}/{repo}", `${REPO}\n`],
    [`gh api -X`, "{}"],
  ]);
  await setAssignee(client, 62, "max", true);
  await setAssignee(client, 62, "max", false);
  assert.ok(
    client.calls.includes(`gh api -X POST repos/${REPO}/issues/62/assignees -f assignees[]=max`),
  );
  assert.ok(
    client.calls.includes(`gh api -X DELETE repos/${REPO}/issues/62/assignees -f assignees[]=max`),
  );
});

test("US-DEV-08: setAssignee returns the issue as GitHub answers it, so the claim sees the assignees without a second read", async () => {
  const answer = { number: 62, assignees: [{ login: "max" }, { login: "konradhe14" }] };
  const client = fakeGh([
    ["gh api repos/{owner}/{repo}", `${REPO}\n`],
    ["gh api -X POST", JSON.stringify(answer)],
  ]);
  assert.deepEqual(await setAssignee(client, 62, "max", true), answer);
});

test("US-DEV-08: the three pull request pages are asked for at once, not one after the other (#1487)", async () => {
  const pages = [page(100), page(100), page(100), page(100)];
  let inFlight = 0;
  let peak = 0;
  const client = {
    async run(cmd, args) {
      const line = `${cmd} ${args.join(" ")}`;
      if (line.includes("{owner}/{repo}")) return `${REPO}\n`;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return JSON.stringify(pages[Number(line.match(/&page=(\d+)/)[1]) - 1]);
    },
  };
  assert.equal((await fetchPrs(client)).length, 300);
  assert.equal(peak, 3, "three requests in flight, one per page");
});

test("US-DEV-08: with the standard fetch refspec the branches come from the remote-tracking refs, without a network call", async () => {
  const client = fakeGh([
    ["git config --get-all remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*\n"],
    [
      "git for-each-ref",
      "refs/remotes/origin/main\nrefs/remotes/origin/dev\nrefs/remotes/origin/feat/x-01-a\n",
    ],
    ["git ls-remote", () => assert.fail("origin must not be asked")],
  ]);
  assert.deepEqual(await fetchBranches(client), ["feat/x-01-a"]);
});

test("US-DEV-08: with a narrow fetch refspec (single-branch clone) origin is asked with ls-remote, because the tracked refs would miss branches", async () => {
  const client = fakeGh([
    ["git config --get-all remote.origin.fetch", "+refs/heads/dev:refs/remotes/origin/dev\n"],
    ["git ls-remote", "sha1\trefs/heads/main\nsha2\trefs/heads/feat/x-01-a\n"],
  ]);
  assert.deepEqual(await fetchBranches(client), ["feat/x-01-a"]);
  assert.ok(client.calls.some((c) => c.startsWith("git ls-remote --heads origin")));
});

test("US-DEV-08: a real call with a time limit that does not answer fails with a message that names it (#1487)", async () => {
  const client = realClient({ timeoutMs: 300 });
  await assert.rejects(
    client.run(process.execPath, ["-e", "setTimeout(() => {}, 20000)"]),
    /did not answer within 0\.3 s \(network or GitHub too slow\)/,
  );
});

test("US-DEV-08: a real call without a time limit returns its output", async () => {
  const out = await realClient().run(process.execPath, ["-e", "process.stdout.write('ok')"]);
  assert.equal(out, "ok");
});

test("US-DEV-08: graphqlIds sends every variable as a string, so an option id of digits stays a string", async () => {
  const client = fakeGh([["gh api graphql", '{"data":{"ok":true}}']]);
  await graphqlIds(client, "mutation($option: String!) { ok }", { option: "12345678" });
  assert.ok(client.calls[0].includes(" -f option=12345678"));
  assert.ok(!client.calls[0].includes(" -F option="));
});

/** A process that runs: alive, and not a zombie where /proc shows one. */
function isRunning(pid) {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    return !/\) Z /.test(readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch {
    return true; // no /proc (macOS): being alive is all there is to tell
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, ms = 10_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("the condition was not met in time");
    await sleep(50);
  }
}

// Stands in for the pre-push hook of git push: a long-lived child of the command (its pid goes to argv[2]), and the command itself
// keeps running. With the argument "ignore-term" both ignore SIGTERM.
const HOOK_STAND_IN = `
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const [pidFile, mode] = process.argv.slice(2);
const ignoreTerm = mode === "ignore-term";
const sleeper = (ignoreTerm ? "process.on('SIGTERM', () => {});" : "") + "setInterval(() => {}, 1000);";
const child = spawn(process.execPath, ["-e", sleeper], { stdio: "ignore" });
writeFileSync(pidFile, String(child.pid));
if (ignoreTerm) process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`;

/** Runs `run(dir)` in a scratch folder that holds the stand-in hook (hook.mjs); the folder is removed afterwards. */
async function withScratch(run) {
  const dir = mkdtempSync(path.join(tmpdir(), "claim-limit-"));
  try {
    writeFileSync(path.join(dir, "hook.mjs"), HOOK_STAND_IN);
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("US-DEV-08: a call with a limit runs under that limit, a call without one under the client's default", async () => {
  const client = realClient({ timeoutMs: 200, limits: { [PUSH_LIMIT]: 5000 } });
  const late = ["-e", "setTimeout(() => process.stdout.write('late'), 600)"];
  assert.equal(await client.run(process.execPath, late, { limit: PUSH_LIMIT }), "late");
  await assert.rejects(client.run(process.execPath, late), CallTimeout);
});

test("US-DEV-08: a timed-out command leaves no process behind: its child is gone when the call fails", () =>
  withScratch(async (dir) => {
    const pidFile = path.join(dir, "pid");
    await assert.rejects(
      realClient({ timeoutMs: 2000 }).run(process.execPath, [path.join(dir, "hook.mjs"), pidFile]),
      CallTimeout,
    );
    assert.equal(
      isRunning(Number(readFileSync(pidFile, "utf8"))),
      false,
      "the child of the timed-out command still runs",
    );
  }));

test("US-DEV-08: a process that ignores SIGTERM is killed when the grace time of its group is over", () =>
  withScratch(async (dir) => {
    const pidFile = path.join(dir, "pid");
    const client = realClient({ timeoutMs: 2000, killGraceMs: 300 });
    await assert.rejects(
      client.run(process.execPath, [path.join(dir, "hook.mjs"), pidFile, "ignore-term"]),
      CallTimeout,
    );
    assert.equal(
      isRunning(Number(readFileSync(pidFile, "utf8"))),
      false,
      "a process that ignores SIGTERM survived the call",
    );
  }));

test("US-DEV-08: Ctrl+C in make claim ends the groups of its calls too: the claim exits with 130 and nothing is left running", () =>
  withScratch(async (dir) => {
    const pidFile = path.join(dir, "pid");
    const claimLike = path.join(dir, "claim-like.mjs");
    const groupsUrl = new URL("./calls/github-calls.mjs", import.meta.url).href;
    writeFileSync(
      claimLike,
      `import { realClient } from ${JSON.stringify(groupsUrl)};\n` +
        "await realClient({ timeoutMs: 60000 }).run(process.execPath, [process.argv[2], process.argv[3]]).catch(() => {});\n",
    );
    const claim = spawn(process.execPath, [claimLike, path.join(dir, "hook.mjs"), pidFile], {
      stdio: "ignore",
    });
    await until(() => existsSync(pidFile));
    claim.kill("SIGINT");
    const [code] = await once(claim, "exit");
    assert.equal(code, 130, "the claim should exit with 128 + SIGINT");
    assert.equal(
      isRunning(Number(readFileSync(pidFile, "utf8"))),
      false,
      "the child of the call still runs after Ctrl+C",
    );
  }));

test("US-DEV-08: a git push that outlives its limit is ended with its hook; the message names the pre-push gates, not the network", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "claim-push-"));
  const oldPath = process.env.PATH;
  try {
    // Stands in for git push: a child that keeps running, as the pre-push hook does while make gates runs.
    const pidFile = path.join(dir, "hook.pid");
    writeFileSync(
      path.join(dir, "git"),
      `#!/bin/sh\nsleep 60 &\necho $! > ${JSON.stringify(pidFile)}\nwait\n`,
      { mode: 0o755 },
    );
    process.env.PATH = `${dir}${path.delimiter}${oldPath}`;
    const client = realClient({ timeoutMs: 60_000, limits: { [PUSH_LIMIT]: 2000 } });
    const error = await pushClaimBranch(client, "feat/x-01-a", "abc123").then(
      () => null,
      (e) => e,
    );
    assert.ok(error, "the push should have timed out");
    assert.match(error.message, /did not finish within 2 s/);
    assert.match(error.message, /the pre-push gates \(make gates\) took longer than that/);
    assert.match(error.message, /CLAIM_PUSH_TIMEOUT_S/);
    assert.doesNotMatch(error.message, /run it again|network/);
    assert.equal(
      isRunning(Number(readFileSync(pidFile, "utf8"))),
      false,
      "the stand-in for the hook still runs",
    );
  } finally {
    process.env.PATH = oldPath;
    rmSync(dir, { recursive: true, force: true });
  }
});
