import { test } from "node:test";
import assert from "node:assert/strict";
import { hintsFor } from "./git-hook-hints.mjs";

test("US-DEV-02: geänderte Abhängigkeiten und Migrationen erzeugen je einen Hinweis", () => {
  assert.deepEqual(
    hintsFor([
      "app/package-lock.json",
      "app/packages/web/package.json",
      "app/packages/db/migrations/0003_art.sql",
    ]),
    ["Abhängigkeiten geändert: make setup", "Neue Migrationen: make migrate"],
  );
});

test("US-DEV-02: reine Code- oder Doku-Änderungen erzeugen keinen Hinweis", () => {
  assert.deepEqual(hintsFor(["app/packages/core/src/index.ts", "Docs/ROADMAP.md"]), []);
});

test("US-DEV-02: Änderungen an Hooks und Node-Version werden gemeldet", () => {
  assert.deepEqual(hintsFor([".githooks/pre-push", ".nvmrc"]), [
    "Git-Hooks geändert: make hooks",
    "Node-Version geändert: siehe .nvmrc",
  ]);
});
