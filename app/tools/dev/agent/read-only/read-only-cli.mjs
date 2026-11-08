// The five read-only make targets for agents (US-DEV-13, issue 1716): `make run-jobs`, `make conflicts`, `make test-files`,
// `make format-check` and `make board-item`. Each one reads GitHub, git or the repository and writes nothing, except that
// `conflicts` refreshes origin/dev and FETCH_HEAD (a fetch) and writes no branch and no commit. The inputs come from the
// environment as the raw make values (REST_RUN, REST_PR, REST_ISSUE, RAW_FILES), never from the command line, and every child
// process gets its arguments as an array (execFile or spawn, no shell): a `;`, `$(...)`, a backtick or a space in a value is data.
// Usage: node read-only-cli.mjs run-jobs|conflicts|test-files|format-check|board-item
// Exit 0 ok (conflicts: clean), 1 a read or a run failed or a merge conflicts, 2 usage or input refused before any call.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { realClient, repoName } from "../../../workflow/claim/lib/claim-client.mjs";
import { boardItemOf } from "../../../workflow/claim/lib/board-client.mjs";
import { pagedKey } from "../../../workflow/actions/ci-reuse/ci-wait.mjs";
import { filesOf, numberOf, requireFiles, runnerOf, UsageError } from "./read-only-lib.mjs";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const APP = join(ROOT, "app");
const DOCS_ROOTS = ["app", "docs", "tools", ".claude"]; // what format-check may read: the folders the repo's Prettier covers, and docs
const TEST_ROOTS = ["app"];

const done = (text, code = 0) => ({ code, text });
const jobLine = (job) =>
  `  ${job.name}: ${job.status}, ${job.conclusion ?? "no conclusion yet"}  ${job.html_url}`;

/** `run-jobs`: name, status, conclusion and URL of each job of one workflow run (REST, every page; US-DEV-13, issue 1716). */
async function runJobs(client, env) {
  const run = numberOf(env.REST_RUN, "RUN");
  const repo = await repoName(client);
  const jobs = await pagedKey(client, `repos/${repo}/actions/runs/${run}/jobs`, "jobs");
  return done([`RUN ${run}: ${jobs.length} jobs`, ...jobs.map(jobLine)].join("\n"));
}

/** The conflicting files of a failed merge-tree: exit 1 with a tree id first, then one name per file (-z); null otherwise. */
function conflictedFiles(error) {
  if (error.code !== 1 || !/^[0-9a-f]{40,64}\0/.test(error.stdout ?? "")) return null;
  return error.stdout.split("\0").slice(1).filter(Boolean);
}

/** `conflicts`: whether the PR head merges into origin/dev without a conflict; writes no branch and no commit (US-DEV-13). */
async function conflicts(git, env) {
  const n = numberOf(env.REST_PR, "PR");
  await git.run("git", ["fetch", "--quiet", "origin", "+refs/heads/dev:refs/remotes/origin/dev"]);
  await git.run("git", ["fetch", "--quiet", "origin", `refs/pull/${n}/head`]);
  const head = (await git.run("git", ["rev-parse", "--verify", "FETCH_HEAD^{commit}"])).trim();
  const base = (await git.run("git", ["rev-parse", "--verify", "origin/dev^{commit}"])).trim();
  const short = head.slice(0, 7);
  try {
    await git.run("git", [
      "merge-tree",
      "--write-tree",
      "--name-only",
      "--no-messages",
      "-z",
      base,
      head,
    ]);
    return done(`clean: PR #${n} (head ${short}) merges into origin/dev`);
  } catch (error) {
    const files = conflictedFiles(error);
    if (!files) throw error;
    const list = files.map((file) => `  ${file}`);
    return done(
      [`conflicts: PR #${n} (head ${short}) does not merge into origin/dev, in:`, ...list].join(
        "\n",
      ),
      1,
    );
  }
}

/** Runs one command with its output on this terminal; resolves its exit code (1 when it could not start or was killed). */
function inherit(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit" });
    child.on("error", (error) => {
      console.error(`read-only: ${cmd} did not start: ${error.message}`);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

/** Groups the files by runner and folder, so each group is one vitest or node --test run (one argument per file). */
function runsOf(files) {
  const groups = new Map();
  for (const file of files) {
    const { kind, dir } = runnerOf(file);
    const key = `${kind} ${dir}`;
    if (!groups.has(key)) groups.set(key, { kind, dir, files: [] });
    groups.get(key).files.push(join(ROOT, file));
  }
  return [...groups.values()];
}

/** `test-files`: vitest on the given test files in their own workspace packages, node --test for tool tests (US-DEV-13). */
async function testFiles(env) {
  const files = requireFiles(filesOf(env.RAW_FILES, TEST_ROOTS), ROOT);
  const runs = runsOf(files);
  let code = 0;
  for (const run of runs) {
    const cwd = join(ROOT, run.dir);
    const [cmd, args] =
      run.kind === "vitest"
        ? ["npx", ["--no-install", "vitest", "run", ...run.files]]
        : [process.execPath, ["--test", ...run.files]];
    code = Math.max(code, await inherit(cmd, args, cwd));
  }
  return done("", code);
}

/** Refuses a file that Prettier would not check: an ignored one (its check passes without looking) or one with no parser. */
async function requirePrettierFile(file) {
  const out = await realClient({ cwd: APP }).run("npx", [
    "--no-install",
    "prettier",
    "--file-info",
    join(ROOT, file),
  ]);
  const info = JSON.parse(out);
  if (info.ignored)
    throw new UsageError(
      `FILES: ${file} is ignored by app/.prettierignore: Prettier would check nothing`,
    );
  if (!info.inferredParser)
    throw new UsageError(`FILES: ${file} has no Prettier parser: format-check cannot read it`);
}

/** `format-check`: Prettier --check with the repo config (app/.prettierrc.json) on the files; writes nothing (US-DEV-13). */
async function formatCheck(env) {
  const files = requireFiles(filesOf(env.RAW_FILES, DOCS_ROOTS), ROOT);
  for (const file of files) await requirePrettierFile(file);
  const args = [
    "--no-install",
    "prettier",
    "--check",
    "--config",
    ".prettierrc.json",
    ...files.map((f) => join(ROOT, f)),
  ];
  return done("", await inherit("npx", args, APP));
}

/** `board-item`: the board fields of one issue on "PflanzenDex Roadmap", one fixed read-only query (US-DEV-13, issue 1716). */
async function boardItem(client, env) {
  const n = numberOf(env.REST_ISSUE, "ISSUE");
  const item = await boardItemOf(client, { repo: await repoName(client), number: n });
  if (!item) return done(`ISSUE #${n} is not on the board "PflanzenDex Roadmap"`);
  return done(
    [
      `ISSUE #${n} on the board "PflanzenDex Roadmap"`,
      `  Status: ${item.status ?? "none"}`,
      `  Typ: ${item.typ ?? "none"}`,
      `  Epic: ${item.epicName ?? "none"}`,
      `  Priority: ${item.priority ?? "none"}`,
      `  Release: ${item.release ?? "none"}`,
    ].join("\n"),
  );
}

const COMMANDS = {
  "run-jobs": (env) => runJobs(realClient(), env),
  conflicts: (env) => conflicts(realClient(), env),
  "test-files": (env) => testFiles(env),
  "format-check": (env) => formatCheck(env),
  "board-item": (env) => boardItem(realClient(), env),
};

/** Runs one command; a refused input throws UsageError before any call, every other failure is a failed call. */
async function main(argv, env) {
  if (!Object.hasOwn(COMMANDS, argv[0]) || argv.length !== 1)
    throw new UsageError(`usage: read-only-cli.mjs ${Object.keys(COMMANDS).join("|")}`);
  return COMMANDS[argv[0]](env);
}

async function cli(argv) {
  try {
    const { code, text } = await main(argv, process.env);
    if (text) console.log(text);
    return code;
  } catch (error) {
    console.error(`read-only: ${error.message}`);
    return error instanceof UsageError ? 2 : 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
