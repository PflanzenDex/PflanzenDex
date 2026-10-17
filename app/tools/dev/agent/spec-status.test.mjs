// Tests for the generated spec status table (US-DEV-05: status stays derivable from the specs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { collect, render, replaceBlock, START, END } from "./spec-status.mjs";

const SPEC = [
  "### US-ACC-01 · Sign in · ✅ (prototype ✅)",
  "### US-ACC-02 · Profile · 🟨 new",
  "### US-ACC-03 · Invite · ⬜ new",
  "| FR-ACC-01 | Accounts exist | ✅ |",
  "| FR-ACC-02 | Roles | ⬜ assumption |",
  "| DM-ACC-01 | not counted | ✅ |",
].join("\n");

test("US-DEV-05: counts stories and requirements per epic from the spec text", () => {
  const acc = collect([SPEC]).get("ACC");
  assert.deepEqual(acc.us, { "✅": 1, "🟨": 1, "⬜": 1 });
  assert.deepEqual(acc.fr, { "✅": 1, "🟨": 0, "⬜": 1 });
  assert.equal(acc.tried, 1);
});

test("US-DEV-05: the table has one row per epic and a total", () => {
  const out = render(collect([SPEC]));
  assert.match(out, /\| ACC Accounts +\| 3 +\| 1 +\| 1 +\| 1 +\| 1 · 0 · 1 +\| 1 +\| 2 +\|/);
  assert.match(out, /\*\*Total\*\*/);
});

test("US-DEV-05: replaceBlock swaps only the marked block and reports missing markers", () => {
  const readme = `a\n${START}\nold\n${END}\nb\n`;
  assert.equal(replaceBlock(readme, "T"), `a\n${START}\n\nT\n\n${END}\nb\n`);
  assert.equal(replaceBlock("no markers", "T"), null);
});
