// Tests für die Versionsregeln (US-DEV-06, FR-QG-14): welcher Commit welchen Release auslöst.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import config from "../release.config.js";

const [, analyzerConfig] = config.plugins.find(
  (p) => Array.isArray(p) && p[0] === "@semantic-release/commit-analyzer",
);
const logger = { log() {} };
const releaseFor = (...messages) =>
  analyzeCommits(analyzerConfig, {
    commits: messages.map((message, i) => ({ hash: String(i), message })),
    logger,
    cwd: process.cwd(),
  });

test("US-DEV-06: feat erzeugt Minor, fix und fix(deps) erzeugen Patch", async () => {
  assert.equal(await releaseFor("feat(pha): Phase ableiten"), "minor");
  assert.equal(await releaseFor("fix(bes): Namensregel"), "patch");
  assert.equal(await releaseFor("fix(deps): update dependency hono to v4.14.0"), "patch");
});

test("US-DEV-06: docs, chore, ci und chore(deps) erzeugen keinen Release (FR-DEV-09)", async () => {
  assert.equal(
    await releaseFor("docs: Roadmap", "chore(deps): update vitest", "ci(qg): Job ergänzt"),
    null,
  );
});

test("US-DEV-06: Breaking Change hebt vor 1.0 nur die Minor-Version", async () => {
  assert.equal(await releaseFor("feat(api)!: Pfade umbenannt"), "minor");
  assert.equal(
    await releaseFor("fix(db): Spalte entfernt\n\nBREAKING CHANGE: alte Spalte entfällt"),
    "minor",
  );
});

test("US-DEV-06: Releases nur von main", () => {
  assert.deepEqual(config.branches, ["main"]);
});
