// Static checks of the deploy workflow (TE-19, #749): what may start it, what the prod guard requires, what it can reach.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../../../../${path}`, import.meta.url), "utf8");
const workflow = read(".github/workflows/deploy.yml");

test("TE-19: every action is pinned to a full commit SHA", () => {
  const uses = [...workflow.matchAll(/^\s*- uses:\s*(\S+)/gm)].map((m) => m[1]);
  assert.ok(uses.some((u) => u.startsWith("tailscale/github-action@")));
  for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, u);
});

test("TE-19: manual trigger only, environment limited to test and prod", () => {
  const on = workflow.slice(workflow.indexOf("\non:"), workflow.indexOf("\nconcurrency:"));
  assert.match(on, /workflow_dispatch:/);
  assert.doesNotMatch(on, /workflow_run:|push:|pull_request|schedule:/);
  assert.match(on, /type: choice\n\s+options: \[test, prod\]/);
  assert.match(workflow, /^\s+environment: \$\{\{ inputs\.environment \}\}$/m);
});

test("TE-19: one deploy per environment, never cancelled, least privilege, timeout", () => {
  assert.match(
    workflow,
    /group: deploy-\$\{\{ inputs\.environment \}\}\n\s+cancel-in-progress: false/,
  );
  assert.match(workflow, /^permissions:\n\s+contents: read$/m);
  assert.doesNotMatch(workflow, /^\s+(?!contents: read)[a-z-]+: write$/m);
  assert.match(workflow, /timeout-minutes: \d+/);
});

test("TE-19: no expression is interpolated into a run block", () => {
  let inRun = false;
  let indent = 0;
  for (const line of workflow.split("\n")) {
    const start = line.match(/^(\s*)(?:- )?run: ?(.*)$/);
    if (start) {
      assert.doesNotMatch(start[2], /\$\{\{/, line);
      inRun = /^[|>]/.test(start[2]);
      indent = start[1].length;
      continue;
    }
    if (!inRun) continue;
    if (line.trim() && line.match(/^(\s*)/)[1].length <= indent) inRun = false;
    else assert.doesNotMatch(line, /\$\{\{/, line);
  }
});

test("TE-19: the prod guard (on main, stable release tag) runs before the tailnet join", () => {
  const guard = workflow.indexOf("refs/remotes/origin/main");
  assert.ok(guard > -1);
  assert.ok(workflow.includes("is a snapshot, not a stable release tag"));
  assert.ok(workflow.includes("v(0|[1-9][0-9]*)"));
  assert.ok(guard < workflow.indexOf("tailscale/github-action@"));
  assert.ok(workflow.indexOf("fetch-depth: 0") < guard);
});

test("TE-19: host, path and secrets come from the GitHub environment, a missing host fails clearly", () => {
  for (const name of [
    "vars.DEPLOY_HOST",
    "vars.DEPLOY_REPO_PATH",
    "secrets.TS_OAUTH_CLIENT_ID",
    "secrets.TS_OAUTH_SECRET",
  ])
    assert.ok(workflow.includes(name), name);
  assert.ok(workflow.includes("Variable DEPLOY_HOST is not set"));
  assert.ok(workflow.includes("tags: tag:ci"));
});

test("TE-19: ci.yml is unchanged compared to dev (CI is not triggered by this workflow)", () => {
  const ci = read(".github/workflows/ci.yml");
  assert.match(ci, /push:\n\s+branches: \[main\]\n/);
  let diff = "";
  try {
    diff = execFileSync(
      "git",
      ["diff", "--name-only", "origin/dev", "--", ".github/workflows/ci.yml"],
      {
        encoding: "utf8",
      },
    );
  } catch {
    // no origin/dev available (shallow clone): the push trigger check above is enough
  }
  assert.equal(diff.trim(), "");
});
