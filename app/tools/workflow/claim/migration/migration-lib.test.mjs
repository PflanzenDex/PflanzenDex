import { test } from "node:test";
import assert from "node:assert/strict";
import { findProblems, nextNumber, numberOf, reservedIn } from "./migration-lib.mjs";
import { stub } from "./new-migration.mjs";
import { collect } from "./git-view.mjs";

test("US-DEV-07: numberOf reads the four digit prefix of migration files only", () => {
  assert.equal(numberOf("app/packages/db/migrations/0066_pokedex_x.sql"), 66);
  assert.equal(numberOf("README.md"), undefined);
});

test("US-DEV-07: a reservation is read from the Handoff line of a PR body", () => {
  assert.equal(reservedIn("- **Migration number:** 0067 (reserved)"), 67);
  assert.equal(reservedIn("- **Verification:** none"), undefined);
  assert.equal(reservedIn(null), undefined);
});

test("US-DEV-07: the next number is above everything taken, a free own reservation wins", () => {
  assert.equal(nextNumber({ taken: [64, 66, 67] }), 68);
  assert.equal(nextNumber({ taken: [64, 66], own: 65 }), 65);
  assert.equal(nextNumber({ taken: [64, 66, 67], own: 67 }), 68);
  assert.equal(nextNumber({ taken: [] }), 1);
});

test("US-DEV-07: two migrations with the same number fail", () => {
  const problems = findProblems({ files: ["0001_a_x.sql", "0001_b_y.sql"] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /0001 is used twice/);
});

test("US-DEV-07: a new migration must be above the highest number on origin/dev", () => {
  const devFiles = ["0001_a_x.sql", "0003_a_z.sql"];
  assert.deepEqual(findProblems({ files: [...devFiles, "0004_a_n.sql"], devFiles }), []);
  assert.match(
    findProblems({ files: [...devFiles, "0002_a_n.sql"], devFiles })[0],
    /not above 0003/,
  );
  assert.deepEqual(findProblems({ files: ["0002_a_n.sql"] }), []);
});

test("US-DEV-07: the stub names the module and the story of the branch", () => {
  assert.match(stub("light_example", "feat/us-bes-06-x"), /^-- module: light\n-- US-BES-06:/);
});

test("US-DEV-07: collect counts dev, other PR branches and their reservations, not the own branch", () => {
  const prs = [
    { headRefName: "a", body: "- **Migration number:** 0090" },
    { headRefName: "mine", body: "- **Migration number:** 0091" },
  ];
  const { taken, own } = collect({ cwd: process.cwd(), branch: "mine", prs });
  assert.ok(taken.includes(90));
  assert.ok(!taken.includes(91));
  assert.equal(own, 91);
});
