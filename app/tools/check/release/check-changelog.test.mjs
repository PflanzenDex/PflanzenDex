import { test } from "node:test";
import assert from "node:assert/strict";
import { FRAGMENT_DIR } from "../../../packages/web/src/app/destinations/account-area/whats-new/news-lines.mjs";
import { checkChangelog, CHANGELOG_FILE, commitType, isFragmentPath } from "./check-changelog.mjs";

const FRAGMENT = `${FRAGMENT_DIR}/1490-neu.json`;
const added = (path) => ({ status: "A", path });

/** Runs the gate on a title, the PR's changes and the texts of the files at the PR head. */
function run({ title, body, changes = [], texts = {} }) {
  return checkChangelog({ title, body, changes, readFile: (path) => texts[path] ?? "" });
}

test("US-DEV-06 QG-U3: the commit type is read from the title", () => {
  assert.equal(commitType("feat(pha): add phase"), "feat");
  assert.equal(commitType("Fix!: breaking"), "fix");
  assert.equal(commitType("no type here"), null);
});

test("US-DEV-06 QG-U3: only a new fragment file in the fragment folder counts as a fragment", () => {
  assert.equal(isFragmentPath(FRAGMENT), true);
  assert.equal(isFragmentPath(CHANGELOG_FILE), false);
  assert.equal(isFragmentPath(`${FRAGMENT_DIR}/notes.json`), false);
  assert.equal(isFragmentPath(`${FRAGMENT_DIR}/sub/1490-neu.json`), false);
  assert.equal(isFragmentPath(`app/elsewhere/1490-neu.json`), false);
});

test("US-DEV-06 QG-U3: feat without a fragment fails and names the folder, the format and the marker", () => {
  const r = run({ title: "feat(pha): add phase", changes: [{ status: "M", path: "app/x.ts" }] });
  assert.equal(r.ok, false);
  assert.match(r.message, /unreleased\/<issue>-<slug>\.json/);
  assert.match(r.message, /\[skip-changelog\]/);
});

test("US-DEV-06 QG-U3: fix without a fragment fails", () => {
  assert.equal(run({ title: "fix(api): crash" }).ok, false);
});

test("US-DEV-06 QG-U3: feat that adds a fragment with a line passes", () => {
  const r = run({
    title: "feat(pha): add phase",
    changes: [added(FRAGMENT)],
    texts: { [FRAGMENT]: '{ "line": "Neu: Phasen." }' },
  });
  assert.equal(r.ok, true);
  assert.match(r.message, /1490-neu\.json/);
});

test("US-DEV-06 QG-U3: a fragment whose line is empty does not satisfy the gate", () => {
  const r = run({
    title: "feat(pha): add phase",
    changes: [added(FRAGMENT)],
    texts: { [FRAGMENT]: '{ "line": "  " }' },
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /1490-neu\.json has no non-empty "line"/);
});

test("US-DEV-06 QG-U3: a fragment that is not JSON does not satisfy the gate", () => {
  const r = run({
    title: "fix(api): crash",
    changes: [added(FRAGMENT)],
    texts: { [FRAGMENT]: "Text ohne JSON" },
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /has no non-empty "line"/);
});

test("US-DEV-06 QG-U3: editing an existing fragment does not satisfy the gate", () => {
  const r = run({
    title: "feat(pha): add phase",
    changes: [{ status: "M", path: FRAGMENT }],
    texts: { [FRAGMENT]: '{ "line": "Geändert." }' },
  });
  assert.equal(r.ok, false);
});

test("US-DEV-06 QG-U3: deleting a fragment does not satisfy the gate", () => {
  const r = run({
    title: "fix(api): crash",
    changes: [{ status: "D", path: FRAGMENT }],
  });
  assert.equal(r.ok, false);
});

test("US-DEV-06 QG-U3: editing news.de.json alone fails and says where the line goes now", () => {
  const r = run({
    title: "feat(pha): add phase",
    changes: [{ status: "M", path: CHANGELOG_FILE }],
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /takes no new lines any more/);
  assert.match(r.message, /unreleased\/<issue>-<slug>\.json/);
});

test("US-DEV-06 QG-U3: a file added outside the fragment folder does not satisfy the gate", () => {
  const r = run({
    title: "feat(pha): add phase",
    changes: [added("app/packages/web/src/news/1490-neu.json")],
    texts: { "app/packages/web/src/news/1490-neu.json": '{ "line": "Neu." }' },
  });
  assert.equal(r.ok, false);
});

test("US-DEV-06 QG-U3: a fragment with a name that is not an issue number does not satisfy the gate", () => {
  const name = `${FRAGMENT_DIR}/neu.json`;
  const r = run({
    title: "feat(pha): add phase",
    changes: [added(name)],
    texts: { [name]: '{ "line": "Neu." }' },
  });
  assert.equal(r.ok, false);
});

test("US-DEV-06 QG-U3: a feat PR that adds a fragment and also edits news.de.json passes on the fragment", () => {
  const r = run({
    title: "feat(pha): add phase",
    changes: [{ status: "M", path: CHANGELOG_FILE }, added(FRAGMENT)],
    texts: { [FRAGMENT]: '{ "line": "Neu." }' },
  });
  assert.equal(r.ok, true);
});

test("US-DEV-06 QG-U3: [skip-changelog] in the title or body passes", () => {
  assert.equal(run({ title: "fix(api): internal [skip-changelog]" }).ok, true);
  assert.equal(run({ title: "feat(qg): gate", body: "[Skip-Changelog]" }).ok, true);
});

test("US-DEV-06 QG-U3: other types need no entry", () => {
  for (const t of ["docs: x", "chore(deps): x", "refactor(core): x", "ci: x", "test(web): x"])
    assert.equal(run({ title: t }).ok, true, t);
});
