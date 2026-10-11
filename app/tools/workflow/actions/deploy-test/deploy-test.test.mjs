// Static checks of the test-environment deploy workflow (TE-19, #749): what may start it, what it can reach.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../../../../${path}`, import.meta.url), "utf8");
const workflow = read(".github/workflows/deploy-test.yml");
const ci = read(".github/workflows/ci.yml");

test("TE-19: the Tailscale action is pinned to a full commit SHA", () => {
  const uses = [...workflow.matchAll(/uses:\s*tailscale\/github-action@(\S+)/g)];
  assert.equal(uses.length, 1);
  assert.match(uses[0][1], /^[0-9a-f]{40}$/);
});

test("TE-19: the job runs in the environment test, serialized, with explicit permissions", () => {
  assert.match(workflow, /^\s+environment: test$/m);
  assert.match(workflow, /group: deploy-test\n\s+cancel-in-progress: false/);
  assert.match(workflow, /^permissions:\n\s+contents: read$/m);
  assert.doesNotMatch(workflow, /^\s+(?!contents: read)[a-z-]+: write$/m);
  assert.match(workflow, /timeout-minutes: \d+/);
});

test("TE-19: no expression is interpolated into a run block", () => {
  const lines = workflow.split("\n");
  let inRun = false;
  let indent = 0;
  for (const line of lines) {
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

test("TE-19: only a successful push run of CI on dev in this repository starts a deploy", () => {
  assert.match(workflow, /workflows: \[CI\]\n\s+types: \[completed\]\n\s+branches: \[dev\]/);
  for (const condition of [
    "workflow_run.conclusion == 'success'",
    "workflow_run.event == 'push'",
    "workflow_run.head_branch == 'dev'",
    "workflow_run.head_repository.full_name == github.repository",
  ])
    assert.ok(workflow.includes(condition), condition);
  assert.ok(workflow.includes("workflow_dispatch"));
});

test("TE-19: CI runs for pushes to dev, otherwise there is no run to wait for", () => {
  assert.match(ci, /push:\n\s+branches: \[main, dev\]/);
});

test("TE-19: host and path come from environment variables, the secrets from the environment", () => {
  assert.ok(workflow.includes("vars.TEST_HOST"));
  assert.ok(workflow.includes("vars.TEST_REPO_PATH"));
  assert.ok(workflow.includes("secrets.TS_OAUTH_CLIENT_ID"));
  assert.ok(workflow.includes("secrets.TS_OAUTH_SECRET"));
  assert.ok(workflow.includes("tags: tag:ci"));
});
