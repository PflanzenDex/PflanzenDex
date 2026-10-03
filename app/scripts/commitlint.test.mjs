// Tests für die Commit-Regeln (US-DEV-02, QG-C1): erlaubte und abgelehnte Nachrichten.
import { test } from "node:test";
import assert from "node:assert/strict";
import lint from "@commitlint/lint";
import load from "@commitlint/load";

const config = await load(
  {},
  { file: "commitlint.config.js", cwd: new URL("..", import.meta.url).pathname },
);
const check = (message) =>
  lint(message, config.rules, {
    parserOpts: config.parserPreset?.parserOpts,
    ignores: config.ignores,
  });

test("US-DEV-02: Conventional Commit mit Epic-Scope und deutschem Betreff ist gültig", async () => {
  for (const m of [
    "feat(pha): Phase aus Messung ableiten (US-PHA-02)",
    "fix(bes): Namensregel für Stecklinge",
    "docs: Roadmap aktualisiert",
    "chore(deps): update dependency vitest to v5.1.0",
  ]) {
    const r = await check(m);
    assert.equal(r.valid, true, `${m}: ${r.errors.map((e) => e.message).join("; ")}`);
  }
});

test("US-DEV-02: unbekannter Typ, unbekannter Scope und zu lange Kopfzeile werden abgelehnt", async () => {
  const cases = {
    "update stuff": "type-empty",
    "feature(pha): neu": "type-enum",
    "feat(pflanzen): neu": "scope-enum",
    [`feat(pha): ${"x".repeat(100)}`]: "header-max-length",
    "feat(pha): Punkt am Ende.": "subject-full-stop",
  };
  for (const [m, rule] of Object.entries(cases)) {
    const r = await check(m);
    assert.equal(r.valid, false, m);
    assert.ok(
      r.errors.some((e) => e.name === rule),
      `${m}: erwartet ${rule}, erhalten ${r.errors.map((e) => e.name)}`,
    );
  }
});

test("US-DEV-02: lokale Merge-Commits werden ignoriert", async () => {
  assert.equal((await check("merge: dev in feat/dev-08-parallel")).valid, true);
  assert.equal((await check("Merge branch 'dev' into feat/x")).valid, true);
});
