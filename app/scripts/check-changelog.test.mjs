import { test } from "node:test";
import assert from "node:assert/strict";
import { checkChangelog, commitType, CHANGELOG_FILE } from "./check-changelog.mjs";

test("QG-U3: the commit type is read from the title", () => {
  assert.equal(commitType("feat(pha): add phase"), "feat");
  assert.equal(commitType("Fix!: breaking"), "fix");
  assert.equal(commitType("no type here"), null);
});

test("QG-U3: feat without an entry fails and names the file and the marker", () => {
  const r = checkChangelog({ title: "feat(pha): add phase", changedFiles: ["app/x.ts"] });
  assert.equal(r.ok, false);
  assert.match(r.message, /news\.de\.json/);
  assert.match(r.message, /\[skip-changelog\]/);
});

test("QG-U3: fix without an entry fails", () => {
  assert.equal(checkChangelog({ title: "fix(api): crash", changedFiles: [] }).ok, false);
});

test("QG-U3: feat with a changelog entry passes", () => {
  assert.equal(
    checkChangelog({ title: "feat(pha): add phase", changedFiles: [CHANGELOG_FILE] }).ok,
    true,
  );
});

test("QG-U3: [skip-changelog] in the title or body passes", () => {
  assert.equal(
    checkChangelog({ title: "fix(api): internal [skip-changelog]", changedFiles: [] }).ok,
    true,
  );
  assert.equal(
    checkChangelog({ title: "feat(qg): gate", body: "[Skip-Changelog]", changedFiles: [] }).ok,
    true,
  );
});

test("QG-U3: other types need no entry", () => {
  for (const t of ["docs: x", "chore(deps): x", "refactor(core): x", "ci: x", "test(web): x"])
    assert.equal(checkChangelog({ title: t, changedFiles: [] }).ok, true, t);
});
