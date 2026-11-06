import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { RESULTS_ENV, inDirs, sharedFindings } from "./eslint-shared.mjs";
import { METRIC_RULES } from "../quality/check-baseline.mjs";
import { RULES as CONSTANT_RULES } from "../code/constants/check-constants.mjs";
import { RULE as UI_TEXT_RULE } from "../code/ui-text/check-ui-text.mjs";

const APP_DIR = fileURLToPath(new URL("../../../", import.meta.url));
const CHECKS = {
  baseline: "tools/check/quality/check-baseline.mjs",
  constants: "tools/check/code/constants/check-constants.mjs",
  "ui-text": "tools/check/code/ui-text/check-ui-text.mjs",
};
const RULES = [...METRIC_RULES, ...Object.values(CONSTANT_RULES), UI_TEXT_RULE];

// Runs one check as `npm run <check>` does, with the shared pass named by `resultsFile` (no ESLint run inside).
function runCheck(name, resultsFile) {
  return spawnSync(process.execPath, [CHECKS[name]], {
    cwd: APP_DIR,
    encoding: "utf8",
    env: { ...process.env, [RESULTS_ENV]: resultsFile },
  });
}

function withTempDir(test) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eslint-shared-"));
  try {
    test(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeShared(dir, files) {
  const file = path.join(dir, "eslint-shared.json");
  fs.writeFileSync(file, JSON.stringify({ rules: RULES, files }));
  return file;
}

describe("US-QG-01 shared ESLint pass", () => {
  it("a finding of each of the three checks is caught through the shared pass (FR-QG-17, FR-QG-12, FR-QG-26)", () =>
    withTempDir((dir) => {
      const file = writeShared(dir, [
        {
          file: "packages/core/src/fixture.ts",
          messages: [
            {
              ruleId: "complexity",
              message: "Function 'build' has a complexity of 20. Maximum allowed is 15.",
              line: 3,
            },
            { ruleId: "constants/no-magic-number", message: "No magic number: 42.", line: 5 },
          ],
        },
        {
          file: "packages/web/src/fixture.tsx",
          messages: [{ ruleId: UI_TEXT_RULE, message: "Literal UI text", line: 2 }],
        },
      ]);

      const baseline = runCheck("baseline", file);
      assert.equal(baseline.status, 1, baseline.stderr);
      assert.match(baseline.stderr, /BL-1 packages\/core\/src\/fixture\.ts build: complexity = 20/);

      const constants = runCheck("constants", file);
      assert.equal(constants.status, 1, constants.stderr);
      assert.match(constants.stderr, /CN-1 packages\/core\/src\/fixture\.ts: 1 numbers/);

      const uiText = runCheck("ui-text", file);
      assert.equal(uiText.status, 1, uiText.stderr);
      assert.match(uiText.stderr, /UT-1 packages\/web\/src\/fixture\.tsx: 1 literal UI text/);
    }));

  it("a missing shared results file fails every check, it never passes them", () =>
    withTempDir((dir) => {
      const missing = path.join(dir, "not-written.json");
      for (const name of Object.keys(CHECKS)) {
        const run = runCheck(name, missing);
        assert.equal(run.status, 1, name);
        assert.match(run.stderr, /did not write/, name);
      }
    }));

  it("a check reads only the files under its own directories", () =>
    withTempDir((dir) => {
      const file = writeShared(dir, [
        {
          file: "tools/only-here.mjs",
          messages: [{ ruleId: CONSTANT_RULES.numbers, message: "x", line: 1 }],
        },
      ]);
      const run = runCheck("constants", file);
      assert.doesNotMatch(run.stderr, /only-here/);
    }));

  it("sharedFindings keeps the files under the given directories and the given rules", () => {
    const data = {
      rules: ["a", "b"],
      files: [
        {
          file: "packages/x/y.ts",
          messages: [
            { ruleId: "a", message: "m", line: 1 },
            { ruleId: "b", message: "n", line: 2 },
          ],
        },
        { file: "tools/z.mjs", messages: [{ ruleId: "a", message: "m", line: 1 }] },
      ],
    };
    assert.deepEqual(sharedFindings(data, { dirs: ["packages/x"], rules: ["a"] }), [
      { file: "packages/x/y.ts", messages: [{ ruleId: "a", message: "m", line: 1 }] },
    ]);
  });

  it("sharedFindings refuses a rule the shared pass did not run, instead of returning nothing", () => {
    assert.throws(
      () => sharedFindings({ rules: ["a"], files: [] }, { dirs: ["."], rules: ["a", "c"] }),
      /did not run: c/,
    );
  });

  it("inDirs matches whole path segments and treats '.' as the whole app", () => {
    assert.equal(inDirs("packages/web/src/a.tsx", ["packages/web/src"]), true);
    assert.equal(inDirs("packages/web/src2/a.tsx", ["packages/web/src"]), false);
    assert.equal(inDirs("tools/a.mjs", ["."]), true);
  });
});
