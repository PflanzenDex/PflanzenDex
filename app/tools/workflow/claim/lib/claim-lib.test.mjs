// US-DEV-08: rules of the claim check (naming, conflicts, staleness)
import test from "node:test";
import assert from "node:assert/strict";
import {
  branchName,
  checkFree,
  claimKey,
  ClaimRefused,
  findConflicts,
  firstOpenRelease,
  keyOfBranch,
  priorNotes,
  refusalReport,
  scopeOf,
  slugOf,
  staleHoursFrom,
  storyIdOf,
  workItems,
} from "./claim-lib.mjs";

const story = {
  number: 62,
  title: "US-BES-06 · Delete or merge specimen",
  labels: [{ name: "story" }],
  assignees: [],
};

test("US-DEV-08: a merged PR that only refers to the issue with Refs #n is a note, never a refusal", () => {
  const prs = [
    { number: 2180, title: "feat(bes): first part (US-BES-06)", body: "Refs #62", state: "MERGED" },
  ];
  assert.deepEqual(findConflicts({ issue: story, prs, branches: [] }), []);
  assert.deepEqual(priorNotes({ issue: story, prs }), [
    "PR #2180 (merged) refers to it (Refs #62): feat(bes): first part (US-BES-06)",
  ]);
});

test("US-DEV-08: a merged PR that closes the issue is a finding, and ALLOW_PRIOR_WORK waives it; it is no note", () => {
  const prs = [{ number: 2, title: "feat(bes): y", body: "Closes #62", state: "MERGED" }];
  const [f] = findConflicts({ issue: story, prs, branches: [] });
  assert.match(f.text, /PR #2 \(merged\)/);
  assert.deepEqual(findConflicts({ issue: story, prs, branches: [], allowPrior: true }), []);
  assert.deepEqual(priorNotes({ issue: story, prs }), []);
});

test("US-DEV-08: a merged PR with Refs #n and Closes #n for the same issue is a finding, not a note", () => {
  const prs = [{ number: 3, title: "feat(bes): y", body: "Refs #62\nCloses #62", state: "MERGED" }];
  assert.equal(findConflicts({ issue: story, prs, branches: [] }).length, 1);
  assert.deepEqual(priorNotes({ issue: story, prs }), []);
});

test("US-DEV-08: an open PR with Refs #n refuses the claim, whatever its title says", () => {
  const prs = [
    {
      number: 4,
      title: "feat(bes): wip (US-BES-06)",
      body: "Refs #62",
      state: "OPEN",
      headRefName: "x",
    },
  ];
  const found = findConflicts({ issue: story, prs, branches: [] });
  assert.equal(found.length, 1);
  assert.match(found[0].text, /PR #4 \(open\)/);
  assert.deepEqual(priorNotes({ issue: story, prs }), []);
});

test("US-DEV-08: a Refs number of another issue (Refs #620, Refs #6) is no note and no finding", () => {
  const prs = [
    { number: 5, title: "a", body: "Refs #620", state: "MERGED" },
    { number: 6, title: "b", body: "Refs #6", state: "MERGED" },
  ];
  assert.deepEqual(findConflicts({ issue: story, prs, branches: [] }), []);
  assert.deepEqual(priorNotes({ issue: story, prs }), []);
});

test("US-DEV-08: the Refs keyword is case-insensitive, accepts References and an optional colon", () => {
  const prs = [
    { number: 7, title: "a", body: "refs #62", state: "MERGED" },
    { number: 8, title: "b", body: "References: #62", state: "MERGED" },
    { number: 9, title: "c", body: "Prefs #62", state: "MERGED" },
  ];
  assert.deepEqual(
    priorNotes({ issue: story, prs }).map((n) => n.match(/PR #(\d+)/)[1]),
    ["7", "8"],
  );
});

test("US-DEV-08: checkFree returns the notes of a merged Refs-only PR and throws only for findings", () => {
  const open = { ...story, state: "OPEN" };
  const prs = [{ number: 2180, title: "x", body: "Refs #62", state: "MERGED" }];
  const { notes } = checkFree({
    issue: open,
    prs,
    branches: [],
    number: 62,
    login: "max",
    allowPrior: false,
  });
  assert.equal(notes.length, 1);
  assert.throws(
    () =>
      checkFree({
        issue: open,
        prs: [{ number: 2, title: "y", body: "Closes #62", state: "MERGED" }],
        branches: [],
        number: 62,
        login: "max",
        allowPrior: false,
      }),
    ClaimRefused,
  );
});

test("US-DEV-08: the claim key is the issue number, never the story ID (a story ID is shared by many issues)", () => {
  assert.equal(storyIdOf(story.title), "US-BES-06");
  assert.equal(claimKey(story), "issue-62");
  assert.equal(slugOf(story.title), "delete-or-merge-specimen");
  assert.equal(branchName(story), "feat/issue-62-delete-or-merge-specimen");
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

test("US-DEV-08: a story ID in a title links no PR; an open PR whose branch carries the issue number blocks (#393)", () => {
  const prs = [
    { number: 1, title: "wip (US-BES-06)", body: "", state: "OPEN", headRefName: "x" },
    { number: 2, title: "part of it (US-BES-06)", body: "", state: "MERGED", headRefName: "y" },
    { number: 3, title: "z", body: "", state: "OPEN", headRefName: "feat/issue-62-remove" },
  ];
  const found = findConflicts({ issue: story, prs, branches: [] });
  assert.deepEqual(
    found.map((f) => f.text.match(/PR #(\d+)/)[1]),
    ["3"],
  );
});

const sharedStory = {
  number: 2355,
  title: "US-QS-32 · Settings groups",
  state: "OPEN",
  labels: [{ name: "story" }],
  assignees: [],
};

test("US-DEV-08: open PRs of other issues that share the story ID US-QS-32 never block the claim of #2355", () => {
  const prs = [2339, 2340, 2359].map((n) => ({
    number: n,
    title: "fix(qs): settings group (US-QS-32)",
    body: `Refs #${n}`,
    state: "OPEN",
    headRefName: `fix/issue-${n}-settings`,
  }));
  const branches = ["fix/issue-2339-settings", "feat/us-qs-32-old"];
  assert.deepEqual(findConflicts({ issue: sharedStory, prs, branches }), []);
});

test("US-DEV-08: an open PR that refers to the issue (Refs #2355) or carries its branch (issue-2355) blocks; Refs #23550 does not", () => {
  const prs = [
    { number: 1, title: "x", body: "Refs #2355", state: "OPEN", headRefName: "a" },
    { number: 2, title: "y", body: "", state: "OPEN", headRefName: "fix/issue-2355-x" },
    { number: 3, title: "z", body: "Refs #23550", state: "OPEN", headRefName: "fix/issue-23550-z" },
  ];
  const found = findConflicts({ issue: sharedStory, prs, branches: [] });
  assert.deepEqual(
    found.map((f) => f.text.match(/PR #(\d+)/)[1]),
    ["1", "2"],
  );
});

test("US-DEV-08: a merged PR linked only by its branch is no finding; a live origin branch with the issue number blocks, the story ID does not", () => {
  const prs = [
    { number: 4, title: "x", body: "", state: "MERGED", headRefName: "fix/issue-2355-x" },
  ];
  assert.deepEqual(findConflicts({ issue: sharedStory, prs, branches: [] }), []);
  const found = findConflicts({
    issue: sharedStory,
    prs: [],
    branches: ["feat/issue-2355-y", "feat/us-qs-32-z"],
  });
  assert.equal(found.length, 1);
  assert.match(found[0].text, /origin\/feat\/issue-2355-y/);
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

test("US-DEV-08: an origin branch with the issue number blocks; a similar number and a story-ID branch do not", () => {
  const branches = ["feat/issue-62-remove", "feat/issue-620-other", "feat/bes-06-remove"];
  const found = findConflicts({ issue: story, prs: [], branches });
  assert.equal(found.length, 1);
  assert.match(found[0].text, /feat\/issue-62-remove/);
});

test("US-DEV-08: the stale limit is a setting with a documented start value of 48 hours", () => {
  assert.equal(staleHoursFrom({}), 48);
  assert.equal(staleHoursFrom({ CLAIM_STALE_HOURS: "12" }), 12);
  assert.equal(staleHoursFrom({ CLAIM_STALE_HOURS: "nonsense" }), 48);
});

test("US-DEV-08: the claim key of a branch name, with or without US-/FR- prefix", () => {
  assert.equal(keyOfBranch("feat/wac-01-measurement"), "wac-01");
  assert.equal(keyOfBranch("feat/us-wac-01-measurement"), "wac-01");
  assert.equal(keyOfBranch("feat/issue-62-delete"), "issue-62");
  assert.equal(keyOfBranch("chore/issue-243-claim"), "issue-243");
  assert.equal(keyOfBranch("feat/gate-global-reference"), null);
  assert.equal(keyOfBranch("dev"), null);
});

test("US-DEV-11: a generated report issue is no work item and can never be claimed", () => {
  const report = {
    number: 800,
    title: "Retro: Issue flow",
    labels: [{ name: "report" }],
    assignees: [],
  };
  const found = findConflicts({ issue: report, prs: [], branches: [] });
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "report");
  assert.match(found[0].text, /generated report/);
});

test("FR-DEV-10: the refusal of a needs-triage issue names triage, the others name the owner", () => {
  const triage = { kind: "triage", text: "x" };
  const pr = { kind: "pr", text: "y" };
  assert.match(
    refusalReport(5, { findings: [triage], message: "  - x" }),
    /claim refused for #5: the issue needs triage/,
  );
  const other = refusalReport(5, { findings: [pr], message: "  - y" });
  assert.match(other, /someone may already work on it/);
  assert.match(other, /Ask the owner/);
});

test("FR-DEV-10: an issue labelled needs-triage cannot be claimed; the finding names the label", () => {
  const triage = {
    number: 900,
    title: "Login fails",
    labels: [{ name: "bug" }, { name: "needs-triage" }],
    assignees: [],
  };
  const found = findConflicts({ issue: triage, prs: [], branches: [] });
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "triage");
  assert.match(found[0].text, /"needs-triage"/);
  assert.match(found[0].text, /FR-DEV-10/);
});

test("US-DEV-08: the board type decides the branch type, the labels only without one", () => {
  const bug = { number: 7, title: "Login fails", labels: [{ name: "enabler" }], typ: "Bug" };
  assert.equal(branchName(bug), "fix/issue-7-login-fails");
  assert.equal(branchName({ ...bug, typ: "Story" }), "feat/issue-7-login-fails");
  assert.equal(branchName({ ...bug, typ: undefined }), "chore/issue-7-login-fails");
});

test("US-DEV-08: work items are the open stories and enablers of one release on the board", () => {
  const issues = [1, 2, 3, 4, 5].map((number) => ({ number, title: `Item ${number}` }));
  const items = [
    { issue: 1, typ: "Story", release: "R1 Parität" },
    { issue: 2, typ: "Enabler", release: "R1 Parität" },
    { issue: 3, typ: "Bug", release: "R1 Parität" },
    { issue: 4, typ: "Story", release: "R2 Soziales" },
  ];
  assert.deepEqual(
    workItems(issues, items, "R1 Parität").map((i) => [i.number, i.typ]),
    [
      [1, "Story"],
      [2, "Enabler"],
    ],
  );
  const order = ["R0 Fundament", "R1 Parität", "R2 Soziales"];
  assert.equal(firstOpenRelease(order, issues, items), "R1 Parität");
  assert.equal(firstOpenRelease(order, [issues[3]], items), "R2 Soziales");
  assert.equal(firstOpenRelease(order, [issues[4]], items), null);
});
