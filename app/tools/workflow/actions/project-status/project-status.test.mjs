// US-DEV-05: the project status follows the pull requests
import test from "node:test";
import assert from "node:assert/strict";
import { closedIssues, drift, transitions } from "./project-status-lib.mjs";
import { missingPriority } from "./project-status.mjs";

const items = [
  { issue: 1, status: "In Progress" },
  { issue: 2, status: "In Progress" },
  { issue: 3, status: "On dev" },
  { issue: 4, status: "Todo" },
  { issue: 5, status: "Done" },
];

test("US-DEV-05: only closing keywords name an issue", () => {
  assert.deepEqual(closedIssues({ body: "Closes #1, fixes #2\nsee #9 and US-BES-01" }), [1, 2]);
  assert.deepEqual(closedIssues({ body: null }), []);
});

test("US-DEV-05: a PR merged into dev moves its issues to On dev", () => {
  const pr = { number: 10, body: "Closes #1\nCloses #3", base: "dev", merged: true };
  assert.deepEqual(transitions(pr, items), [{ issue: 1, status: "On dev" }]);
});

test("US-DEV-05: a PR closed without a merge sends In Progress back to Todo", () => {
  const pr = { number: 10, body: "Closes #1", base: "dev", merged: false };
  assert.deepEqual(transitions(pr, items), [{ issue: 1, status: "Todo" }]);
});

test("US-DEV-05: a closed PR keeps In Progress while another open PR names the issue", () => {
  const pr = { number: 10, body: "Closes #1", base: "dev", merged: false };
  assert.deepEqual(transitions(pr, items, [{ number: 11, body: "Closes #1" }]), []);
});

test("US-DEV-05: a closed unmerged PR never downgrades On dev", () => {
  const pr = { number: 10, body: "Closes #3", base: "dev", merged: false };
  assert.deepEqual(transitions(pr, items), []);
});

test("US-DEV-05: the release PR moves every On dev item to Done", () => {
  const pr = { number: 20, body: "", base: "main", merged: true };
  assert.deepEqual(transitions(pr, items), [{ issue: 3, status: "Done" }]);
});

test("US-DEV-05: other bases and unknown issues change nothing", () => {
  assert.deepEqual(
    transitions({ number: 1, body: "Closes #1", base: "feature", merged: true }, items),
    [],
  );
  assert.deepEqual(
    transitions({ number: 1, body: "Closes #99", base: "dev", merged: true }, items),
    [],
  );
});

test("US-DEV-05: drift names status contradicting the PRs and missing priority", () => {
  const pItems = [
    { issue: 1, status: "In Progress", priority: "P1 high" },
    { issue: 2, status: "Todo", priority: "P1 high" },
    { issue: 3, status: "Todo", priority: "P1 high" },
    { issue: 4, status: "Todo", priority: null },
    { issue: 6, status: "On dev", priority: null },
    { issue: 5, status: "Todo", priority: null, epic: true },
  ];
  const prs = [
    { number: 10, base: "dev", state: "merged", body: "Closes #1" },
    { number: 11, base: "dev", state: "open", body: "Closes #2" },
    { number: 12, base: "dev", state: "merged", body: "Closes #3" },
  ];
  assert.deepEqual(
    drift(pItems, prs).map((d) => `${d.issue}:${d.problem}`),
    [
      "1:In Progress without an open PR",
      "2:Todo but an open PR names it",
      "3:Todo but a PR into dev is merged",
      "4:no priority",
    ],
  );
});

test("US-DEV-05: missingPriority names open items without a priority, epics and unknown issues excluded", async () => {
  const list = {
    items: [
      { id: "a", content: { type: "Issue", number: 1 }, status: "Todo", priority: "P1 high" },
      { id: "b", content: { type: "Issue", number: 2 }, status: "Todo" },
      { id: "c", content: { type: "Issue", number: 3 }, status: "Todo", typ: "Epic" },
    ],
  };
  const client = { run: async () => JSON.stringify(list) };
  assert.deepEqual(await missingPriority(client, [1, 2, 3, 99]), [2]);
});
