// US-DEV-08: eindeutige Ports/Datenbanknamen je Worktree
import test from "node:test";
import assert from "node:assert/strict";
import { worktreeEnv, slug } from "./worktree-env.mjs";

test("US-DEV-08: gleicher Branch ergibt dieselben Werte", () => {
  assert.deepEqual(worktreeEnv("feat/a"), worktreeEnv("feat/a"));
});

test("US-DEV-08: verschiedene Branches ergeben verschiedene Datenbanknamen", () => {
  const names = new Set(
    ["feat/a", "feat/b", "feat-a", "feat_a"].map((b) => worktreeEnv(b).PFLANZENDEX_TEST_DB_NAME),
  );
  assert.equal(names.size, 4);
});

test("US-DEV-08: Ports liegen im reservierten Bereich und kollidieren nicht mit 54329", () => {
  const e = worktreeEnv("feat/dev-08-parallel");
  for (const k of [
    "PFLANZENDEX_TEST_DB_PORT",
    "PFLANZENDEX_DEV_API_PORT",
    "PFLANZENDEX_DEV_WEB_PORT",
  ]) {
    const p = Number(e[k]);
    assert.ok(p >= 54400 && p < 54400 + 3 * 500, k);
  }
});

test("US-DEV-08: Datenbankname ist ein gültiger Bezeichner", () => {
  assert.match(
    worktreeEnv("Feat/Ä weird name!!").PFLANZENDEX_TEST_DB_NAME,
    /^pflanzendex_[a-z0-9_]+$/,
  );
  assert.equal(slug("feat/te-02"), "feat_te_02");
});

test("US-DEV-08: leerer Branch bricht ab", () => {
  assert.throws(() => worktreeEnv(""));
});
