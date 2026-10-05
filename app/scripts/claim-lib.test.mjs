// US-DEV-08: rules of the claim check (naming, conflicts, staleness)
import test from "node:test";
import assert from "node:assert/strict";
import {
  branchName,
  claimKey,
  findConflicts,
  keyOfBranch,
  scopeOf,
  slugOf,
  staleHoursFrom,
  storyIdOf,
} from "./claim-lib.mjs";

const story = {
  number: 62,
  title: "US-BES-06 · Delete or merge specimen",
  labels: [{ name: "story" }],
  assignees: [],
};

test("US-DEV-08: story ID, key, slug, branch and scope derive from the issue title", () => {
  assert.equal(storyIdOf(story.title), "US-BES-06");
  assert.equal(claimKey(story), "bes-06");
  assert.equal(slugOf(story.title), "delete-or-merge-specimen");
  assert.equal(branchName(story), "feat/bes-06-delete-or-merge-specimen");
  assert.equal(scopeOf(story), "bes");
});

test("US-DEV-08: an enabler without story ID is keyed by its issue number", () => {
  const enabler = {
    number: 243,
    title: "Claim check against duplicate work",
    labels: [{ name: "enabler" }],
  };
  assert.equal(claimKey(enabler), "issue-243");
  assert.equal(branchName(enabler), "chore/issue-243-claim-check-against-duplicate");
  assert.equal(scopeOf(enabler), "dev");
});

test("US-DEV-08: a free story has no conflicts", () => {
  assert.deepEqual(
    findConflicts({ issue: story, prs: [], branches: ["feat/us-bes-07-x", "main"] }),
    [],
  );
});

test("US-DEV-08: an assignee blocks the claim and is named", () => {
  const issue = { ...story, assignees: [{ login: "konradhe14" }] };
  const [f] = findConflicts({ issue, prs: [], branches: [] });
  assert.equal(f.kind, "assignee");
  assert.match(f.text, /@konradhe14/);
});

test("US-DEV-08: PRs closing the issue block (open, merged), closed ones do not", () => {
  const prs = [
    { number: 1, title: "x", body: "Closes #62", state: "OPEN" },
    { number: 2, title: "feat(bes): y", body: "Fixes #62", state: "MERGED" },
    { number: 3, title: "z", body: "Closes #62", state: "CLOSED" },
    { number: 4, title: "other", body: "Closes #620", state: "OPEN" },
  ];
  const found = findConflicts({ issue: story, prs, branches: [] });
  assert.deepEqual(
    found.map((f) => f.text.match(/PR #(\d+)/)[1]),
    ["1", "2"],
  );
});

test("US-DEV-08: a story key alone blocks only while the PR is open, never after the merge (#393)", () => {
  const prs = [
    { number: 1, title: "wip (US-BES-06)", body: "", state: "OPEN", headRefName: "x" },
    { number: 2, title: "part of it (US-BES-06)", body: "", state: "MERGED", headRefName: "y" },
    { number: 3, title: "z", body: "", state: "OPEN", headRefName: "feat/bes-06-remove" },
  ];
  const found = findConflicts({ issue: story, prs, branches: [] });
  assert.deepEqual(
    found.map((f) => f.text.match(/PR #(\d+)/)[1]),
    ["1", "3"],
  );
});

test("US-DEV-08: ALLOW_PRIOR_WORK waives merged PRs but never open ones", () => {
  const prs = [
    { number: 1, title: "x", body: "Closes #62", state: "OPEN" },
    { number: 2, title: "(US-BES-06)", body: "Closes #62", state: "MERGED" },
  ];
  const found = findConflicts({ issue: story, prs, branches: [], allowPrior: true });
  assert.equal(found.length, 1);
  assert.match(found[0].text, /PR #1/);
});

test("US-DEV-08: an origin branch with the story ID blocks, a similar ID does not", () => {
  const branches = ["feat/bes-06-remove", "feat/bes-060-other", "feat/us-bes-07-x"];
  const found = findConflicts({ issue: story, prs: [], branches });
  assert.equal(found.length, 1);
  assert.match(found[0].text, /feat\/bes-06-remove/);
});

test("US-DEV-08: the stale limit is a setting with a documented start value of 48 hours", () => {
  assert.equal(staleHoursFrom({}), 48);
  assert.equal(staleHoursFrom({ CLAIM_STALE_HOURS: "12" }), 12);
  assert.equal(staleHoursFrom({ CLAIM_STALE_HOURS: "nonsense" }), 48);
});

test("US-DEV-08: the claim key of a branch name, with or without US-/FR- prefix", () => {
  assert.equal(keyOfBranch("feat/wac-01-measurement"), "wac-01");
  assert.equal(keyOfBranch("feat/us-wac-01-measurement"), "wac-01");
  assert.equal(keyOfBranch("chore/issue-243-claim"), "issue-243");
  assert.equal(keyOfBranch("feat/gate-global-reference"), null);
  assert.equal(keyOfBranch("dev"), null);
});
