import { test } from "node:test";
import assert from "node:assert/strict";
import { hintsFor } from "./git-hook-hints.mjs";

test("US-DEV-02: changed dependencies and migrations each produce one hint", () => {
  assert.deepEqual(
    hintsFor([
      "app/package-lock.json",
      "app/packages/web/package.json",
      "app/packages/db/migrations/0003_species.sql",
    ]),
    ["Dependencies changed: run make setup", "New migrations: run make migrate"],
  );
});

test("US-DEV-02: plain code or docs changes produce no hint", () => {
  assert.deepEqual(hintsFor(["app/packages/core/src/index.ts", "docs/guides/roadmap.md"]), []);
});

test("US-DEV-02: changes to hooks and the Node version are reported", () => {
  assert.deepEqual(hintsFor([".githooks/pre-push", ".nvmrc"]), [
    "Git hooks changed: run make hooks",
    "Node version changed: see .nvmrc",
  ]);
});
