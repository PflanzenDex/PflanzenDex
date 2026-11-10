// Input rules of the five read-only make targets (US-DEV-13, issue 1716): a number of a run, pull request or issue, the list of
// repository files that test-files and format-check take, and the runner of a test file. Pure, except the file checks, which
// only look at the repository. A value is checked here before any call; the CLI then hands it to a child process as one
// argument of an argument array, never to a shell.
import { realpathSync, statSync } from "node:fs";
import { basename, join, sep } from "node:path";

export class UsageError extends Error {}

const POSITIVE = /^[1-9]\d*$/;
// A repository path: letters, digits, dot, underscore, dash and slash. A leading dash, a quote, `;`, `$`, a backtick or a
// space cannot match it; `..` and node_modules are refused by segment in filesOf.
const REPO_PATH = /^[A-Za-z0-9._/-]+$/;
const PACKAGES = ["core", "api", "db", "web"]; // the workspaces whose `test` script runs vitest (package.json)
const VITEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/; // vitest's default include, as the packages use it
const NODE_TEST_FILE = /\.(?:test|selftest)\.mjs$/; // the tool tests: `npm run test:tools` runs them with node --test

/** A number that goes into a call: a positive whole number, never a text (the path of a REST call, a run or an issue). */
export function numberOf(value, noun) {
  if (!POSITIVE.test(value ?? ""))
    throw new UsageError(`${noun}=<n> must be a positive whole number, got "${value ?? ""}"`);
  return value;
}

/**
 * The repository paths of FILES (separated by spaces). Each starts with one of `roots`, holds only the allowed characters, has
 * no `..` or node_modules segment, and is no .env file (its contents are never read, AGENTS.md).
 */
export function filesOf(raw, roots) {
  const files = (raw ?? "").trim().split(/ +/).filter(Boolean);
  if (files.length === 0)
    throw new UsageError(`FILES="<paths>" is required: repository paths under ${roots.join(", ")}`);
  for (const file of files) {
    const parts = file.split("/");
    const inRoot = roots.some((root) => file.startsWith(`${root}/`));
    const refused =
      !inRoot ||
      !REPO_PATH.test(file) ||
      parts.includes("..") ||
      parts.includes("node_modules") ||
      basename(file).startsWith(".env");
    if (refused)
      throw new UsageError(
        `FILES: "${file}" is not a repository path under ${roots.join(", ")} (letters, digits, . _ - and /; no .., no node_modules, no .env file)`,
      );
  }
  return files;
}

/** Each path must name an existing file, and its real location must lie inside the repository (no link out of it). */
export function requireFiles(files, root) {
  const top = `${realpathSync(root)}${sep}`;
  for (const file of files) {
    const abs = join(root, file);
    if (!statSync(abs, { throwIfNoEntry: false })?.isFile())
      throw new UsageError(`FILES: ${file} does not exist`);
    if (!realpathSync(abs).startsWith(top))
      throw new UsageError(`FILES: ${file} leads outside the repository`);
  }
  return files;
}

/**
 * The runner of a test file: vitest in its workspace package (`dir` is the package), or node --test for a tool test (`dir` is
 * app, where `npm run test:tools` runs them). Any other path, package or name is refused before a run starts.
 */
export function runnerOf(file) {
  const pkg = /^app\/packages\/([^/]+)\//.exec(file)?.[1];
  if (pkg !== undefined) {
    if (!PACKAGES.includes(pkg))
      throw new UsageError(
        `FILES: ${file} is in package ${pkg}, which has no unit test run here (core, api, db, web)`,
      );
    if (!VITEST_FILE.test(file))
      throw new UsageError(
        `FILES: ${file} does not end in a test file name (.test.ts, .test.tsx, .test.mjs, ...)`,
      );
    return { kind: "vitest", dir: `app/packages/${pkg}` };
  }
  if (file.startsWith("app/tools/")) {
    if (!NODE_TEST_FILE.test(file))
      throw new UsageError(
        `FILES: ${file} does not end in a test file name (.test.mjs, .selftest.mjs)`,
      );
    return { kind: "node", dir: "app" };
  }
  throw new UsageError(
    `FILES: ${file} is neither a package test (app/packages/core, api, db, web) nor a tool test (app/tools)`,
  );
}
