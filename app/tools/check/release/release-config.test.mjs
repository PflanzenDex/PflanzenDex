// Tests for the version rules (US-DEV-06, FR-QG-14): which commit triggers which release.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import config from "../../../config/project/release.config.js";

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

test("US-DEV-06: feat triggers a minor, fix and fix(deps) trigger a patch", async () => {
  assert.equal(await releaseFor("feat(pha): derive care phase"), "minor");
  assert.equal(await releaseFor("fix(bes): Steckling naming rule"), "patch");
  assert.equal(await releaseFor("fix(deps): update dependency hono to v4.14.0"), "patch");
});

test("US-DEV-06: docs, chore, ci and chore(deps) trigger no release (FR-DEV-09)", async () => {
  assert.equal(
    await releaseFor("docs: update roadmap", "chore(deps): update vitest", "ci(qg): add job"),
    null,
  );
});

test("US-DEV-06: before 1.0 a breaking change only bumps the minor version", async () => {
  assert.equal(await releaseFor("feat(api)!: rename paths"), "minor");
  assert.equal(
    await releaseFor("fix(db): drop column\n\nBREAKING CHANGE: the old column is gone"),
    "minor",
  );
});

test("US-DEV-06: releases only from main", () => {
  assert.deepEqual(config.branches, ["main"]);
});
