// Tests for the commit rules (US-DEV-02, QG-C1): accepted and rejected messages.
import { test } from "node:test";
import assert from "node:assert/strict";
import lint from "@commitlint/lint";
import load from "@commitlint/load";

const config = await load(
  {},
  { file: "commitlint.config.js", cwd: new URL("../..", import.meta.url).pathname },
);
const check = (message) =>
  lint(message, config.rules, {
    parserOpts: config.parserPreset?.parserOpts,
    ignores: config.ignores,
  });

test("US-DEV-02: a Conventional Commit with an epic scope is valid", async () => {
  for (const m of [
    "feat(pha): derive care phase from measurement (US-PHA-02)",
    "fix(bes): Steckling naming rule",
    "docs: update roadmap",
    "chore(deps): update dependency vitest to v5.1.0",
  ]) {
    const r = await check(m);
    assert.equal(r.valid, true, `${m}: ${r.errors.map((e) => e.message).join("; ")}`);
  }
});

test("US-DEV-02: unknown type, unknown scope and an overlong header are rejected", async () => {
  const cases = {
    "update stuff": "type-empty",
    "feature(pha): new": "type-enum",
    "feat(plants): new": "scope-enum",
    [`feat(pha): ${"x".repeat(100)}`]: "header-max-length",
    "feat(pha): full stop at the end.": "subject-full-stop",
  };
  for (const [m, rule] of Object.entries(cases)) {
    const r = await check(m);
    assert.equal(r.valid, false, m);
    assert.ok(
      r.errors.some((e) => e.name === rule),
      `${m}: expected ${rule}, got ${r.errors.map((e) => e.name)}`,
    );
  }
});

test("US-DEV-02: local merge commits are ignored", async () => {
  assert.equal((await check("merge: dev into feat/dev-08-parallel")).valid, true);
  assert.equal((await check("Merge branch 'dev' into feat/x")).valid, true);
});
