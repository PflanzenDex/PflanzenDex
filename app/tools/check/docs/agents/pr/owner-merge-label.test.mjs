// US-DEV-13 (issue 1774): the label owner-merge marks a pull request that changes a gate file, and only such a pull request.
// The classifier judges with isGateFile of .claude/hooks/rules.mjs (the test make merge uses). The command line talks to
// GitHub through `gh`; the tests put a fake gh first on PATH, so nothing reaches GitHub.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gateFilesOf } from "./owner-merge-label.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "owner-merge-label.mjs");
const taxonomy = JSON.parse(
  readFileSync(path.join(here, "../../../../../config/project/issue-taxonomy.json"), "utf8"),
);
const label = taxonomy.pullRequestLabels.find((entry) => entry.label === "owner-merge");
const madeDirs = [];
after(() => {
  for (const dir of madeDirs) rmSync(dir, { recursive: true, force: true });
});

test("US-DEV-13: the classifier names the changed gate files and only them", () => {
  assert.deepEqual(
    gateFilesOf(["Makefile", "app/packages/core/src/index.ts", ".githooks/pre-push"]),
    ["Makefile", ".githooks/pre-push"],
  );
});

test("US-DEV-13: a pull request without a gate file has no gate file, so it gets no label", () => {
  assert.deepEqual(gateFilesOf(["app/packages/core/src/index.ts", "tools/repo/pr-ready.sh"]), []);
  assert.deepEqual(gateFilesOf([]), []);
});

test("US-DEV-13: a test file that isGateFile excludes does not count; a gate test the list names does", () => {
  assert.deepEqual(gateFilesOf(["app/tools/check/docs/agents/pr/pr-lessons.test.mjs"]), []);
  assert.deepEqual(gateFilesOf(["app/tools/workflow/merge-pr.test.mjs"]), [
    "app/tools/workflow/merge-pr.test.mjs",
  ]);
});

// A fake gh: it logs every call as a JSON array of its arguments and answers by the route of the call. The answers come from
// the environment: FILES (the changed files, one per line), FILES_READ, LABEL_EXISTS, CREATE, ADD and DELETE_RESULT.
const FAKE_GH = `#!${process.execPath}
import { appendFileSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.CALLS, JSON.stringify(args) + "\\n");
const fail = (message) => {
  process.stderr.write(message + "\\n");
  process.exit(1);
};
const method = args.includes("-X") ? args[args.indexOf("-X") + 1] : "GET";
const route = args.find((arg) => arg.startsWith("repos/")) ?? "";
if (args.includes("--paginate")) {
  if (process.env.FILES_READ !== "ok") fail("gh: HTTP 500 (files)");
  process.stdout.write(readFileSync(process.env.FILES, "utf8"));
} else if (route === "repos/{owner}/{repo}/labels/owner-merge" && method === "GET") {
  if (process.env.LABEL_EXISTS === "yes") process.stdout.write("{}\\n");
  else fail("gh: Not Found (HTTP 404)");
} else if (route === "repos/{owner}/{repo}/labels" && method === "POST") {
  if (process.env.CREATE === "422") fail("gh: Validation Failed (HTTP 422) already_exists");
  else if (process.env.CREATE !== "ok") fail("gh: HTTP 500 (create)");
  else process.stdout.write("{}\\n");
} else if (route === "repos/{owner}/{repo}/issues/7/labels" && method === "POST") {
  if (process.env.ADD !== "ok") fail("gh: HTTP 500 (add)");
  else process.stdout.write("[]\\n");
} else if (route === "repos/{owner}/{repo}/issues/7/labels/owner-merge" && method === "DELETE") {
  if (process.env.DELETE_RESULT === "404") fail("gh: Not Found (HTTP 404)");
  else if (process.env.DELETE_RESULT !== "ok") fail("gh: HTTP 500 (delete)");
  else process.stdout.write("[]\\n");
} else {
  fail("unexpected gh call: " + args.join(" "));
}
`;

/** Runs the command line for PR 7 with the fake gh in front; the answers default to a healthy GitHub. */
function runLabel({
  files = [],
  pr = "7",
  filesRead = "ok",
  labelExists = "yes",
  create = "ok",
  add = "ok",
  remove = "ok",
}) {
  const dir = mkdtempSync(path.join(tmpdir(), "owner-merge-label-"));
  madeDirs.push(dir);
  const bin = path.join(dir, "bin");
  const fakeGh = path.join(bin, "gh");
  mkdirSync(bin);
  writeFileSync(fakeGh, FAKE_GH);
  chmodSync(fakeGh, 0o755);
  const filesFile = path.join(dir, "files.txt");
  writeFileSync(filesFile, files.map((file) => `${file}\n`).join(""));
  const calls = path.join(dir, "calls.jsonl");
  const result = spawnSync(process.execPath, [cli], {
    encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      REST_PR: pr,
      CALLS: calls,
      FILES: filesFile,
      FILES_READ: filesRead,
      LABEL_EXISTS: labelExists,
      CREATE: create,
      ADD: add,
      DELETE_RESULT: remove,
    },
  });
  // No call log means gh was never called; a log that cannot be parsed fails the test.
  const logged = existsSync(calls)
    ? readFileSync(calls, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls: logged };
}

const POST_ADD = [
  "api",
  "-X",
  "POST",
  "repos/{owner}/{repo}/issues/7/labels",
  "-f",
  "labels[]=owner-merge",
];
const DELETE = ["api", "-X", "DELETE", "repos/{owner}/{repo}/issues/7/labels/owner-merge"];

test("US-DEV-13: a PR that changes a gate file gets the label, created with its colour when it is missing, and the gate files are named", () => {
  const out = runLabel({
    files: ["app/tools/workflow/merge-pr.mjs", "app/x.ts"],
    labelExists: "no",
  });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /changes gate files \(app\/tools\/workflow\/merge-pr\.mjs\)/);
  const create = out.calls.find(
    (call) => call.includes("repos/{owner}/{repo}/labels") && call.includes("POST"),
  );
  assert.ok(create, JSON.stringify(out.calls));
  assert.ok(create.includes(`name=${label.label}`), JSON.stringify(create));
  assert.ok(create.includes(`color=${label.color}`), JSON.stringify(create));
  assert.ok(create.includes(`description=${label.description}`), JSON.stringify(create));
  assert.deepEqual(out.calls.at(-1), POST_ADD, "the label is added last");
});

test("US-DEV-13: a PR that changes a gate file and finds the label in place only adds it", () => {
  const out = runLabel({ files: ["Makefile"], labelExists: "yes" });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(
    out.calls.some((call) => call.includes("repos/{owner}/{repo}/labels") && call.includes("POST")),
    false,
    "no label is created",
  );
  assert.deepEqual(out.calls.at(-1), POST_ADD);
});

test("US-DEV-13: a label created by a run that finished first (422 already_exists) is no failure", () => {
  const out = runLabel({ files: ["Makefile"], labelExists: "no", create: "422" });
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(out.calls.at(-1), POST_ADD);
});

test("US-DEV-13: a PR without a gate file loses the label with a DELETE, and a 404 on it (no label there) is fine", () => {
  const out = runLabel({ files: ["app/packages/core/src/index.ts"], remove: "404" });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /changes no gate file/);
  assert.deepEqual(out.calls.at(-1), DELETE);
  assert.equal(
    out.calls.some((call) => call.includes("POST")),
    false,
    "nothing is added",
  );
});

test("US-DEV-13: a PR without a gate file whose label removal fails exits 1 and names the failure", () => {
  const out = runLabel({ files: ["app/x.ts"], remove: "500" });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /owner-merge-label: .*HTTP 500/);
});

test("US-DEV-13: a PR with a gate file whose label cannot be added exits 1 and names the failure", () => {
  const out = runLabel({ files: ["Makefile"], add: "500" });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /owner-merge-label: .*HTTP 500/);
});

test("US-DEV-13: when the file list cannot be read, nothing is labelled or unlabelled, and the command exits 1", () => {
  const out = runLabel({ files: ["Makefile"], filesRead: "no" });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /could not read the files of PR #7/);
  assert.deepEqual(
    out.calls.map((call) => call.join(" ")).filter((line) => line.includes("-X")),
    [],
    "no label was written",
  );
});

test("US-DEV-13: a file list at GitHub's cap of 3000 files gets the label, because a gate file may be cut off", () => {
  const files = Array.from({ length: 3000 }, (_, i) => `app/packages/core/src/f${i}.ts`);
  const out = runLabel({ files });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /3000 files/);
  assert.deepEqual(out.calls.at(-1), POST_ADD);
});

test("US-DEV-13: a pull request number that is not a positive whole number is refused before any call", () => {
  for (const pr of ["", "0", "7; touch x", "-3", "1.5"]) {
    const out = runLabel({ files: ["Makefile"], pr });
    assert.equal(out.status, 2, `REST_PR="${pr}"`);
    assert.match(out.stderr, /REST_PR is not a pull request number/);
    assert.deepEqual(out.calls, [], `REST_PR="${pr}" made a call`);
  }
});
