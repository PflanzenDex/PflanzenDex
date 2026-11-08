// US-DEV-13, issue 1716: the input rules of the five read-only make targets (pure functions of read-only-lib.mjs).
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filesOf, numberOf, requireFiles, runnerOf, UsageError } from "./read-only-lib.mjs";

const REFUSED_NUMBERS = [
  "",
  "0",
  "-3",
  "abc",
  "1.5",
  "5x",
  "1;touch x",
  "$(id)",
  "`id`",
  "12 13",
  " 12",
  "012",
];

test("US-DEV-13 issue 1716 numberOf accepts a positive whole number and refuses every other text", () => {
  assert.equal(numberOf("1716", "ISSUE"), "1716");
  for (const bad of REFUSED_NUMBERS) {
    assert.throws(() => numberOf(bad, "RUN"), UsageError, JSON.stringify(bad));
  }
  assert.throws(() => numberOf(undefined, "PR"), /PR=<n> must be a positive whole number/);
});

test("US-DEV-13 issue 1716 filesOf splits a space-separated list and keeps every path under its root", () => {
  assert.deepEqual(filesOf(" app/a.test.ts  app/b/c.test.mjs ", ["app"]), [
    "app/a.test.ts",
    "app/b/c.test.mjs",
  ]);
  assert.deepEqual(filesOf("docs/x.md", ["app", "docs"]), ["docs/x.md"]);
});

test("US-DEV-13 issue 1716 filesOf refuses a path outside its roots, a leading dash, a command, a quote, .. and node_modules", () => {
  const refused = [
    "",
    "Makefile",
    "docs/x.md",
    "/etc/passwd",
    "-x.test.ts",
    "app/a.test.ts;touch x",
    "app/$(id).test.ts",
    "app/`id`.test.ts",
    "app/a'b.test.ts",
    "app/../Makefile",
    "app/packages/core/node_modules/x.test.ts",
    "app/packages/core/.env",
    "app/config/dev/.env",
    "app/a b.test.ts",
  ];
  for (const bad of refused) {
    assert.throws(() => filesOf(bad, ["app"]), UsageError, JSON.stringify(bad));
  }
});

test("US-DEV-13 issue 1716 requireFiles refuses a missing file and a link that leads out of the repository", () => {
  const root = mkdtempSync(join(tmpdir(), "read-only-lib-1716-"));
  const outside = mkdtempSync(join(tmpdir(), "read-only-lib-1716-out-"));
  try {
    mkdirSync(join(root, "app"));
    writeFileSync(join(root, "app", "real.test.ts"), "");
    writeFileSync(join(outside, "secret.test.ts"), "");
    symlinkSync(join(outside, "secret.test.ts"), join(root, "app", "link.test.ts"));
    assert.deepEqual(requireFiles(["app/real.test.ts"], root), ["app/real.test.ts"]);
    assert.throws(() => requireFiles(["app/missing.test.ts"], root), /does not exist/);
    assert.throws(() => requireFiles(["app/link.test.ts"], root), /leads outside the repository/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("US-DEV-13 issue 1716 runnerOf sends a package test to vitest in its package and a tool test to node --test", () => {
  assert.deepEqual(runnerOf("app/packages/core/src/account/account.test.ts"), {
    kind: "vitest",
    dir: "app/packages/core",
  });
  assert.deepEqual(runnerOf("app/packages/web/src/shared/x.test.tsx"), {
    kind: "vitest",
    dir: "app/packages/web",
  });
  assert.deepEqual(runnerOf("app/tools/dev/agent/quiet.test.mjs"), { kind: "node", dir: "app" });
});

test("US-DEV-13 issue 1716 runnerOf refuses a file without a test name, an e2e package and a path that is no test", () => {
  const refused = [
    "app/packages/core/src/account/account.ts",
    "app/packages/e2e/tests/light.spec.ts",
    "app/tools/dev/agent/quiet.mjs",
    "app/config/gates/quality-limits.json",
    "docs/x.test.mjs",
  ];
  for (const bad of refused) {
    assert.throws(() => runnerOf(bad), UsageError, bad);
  }
});
