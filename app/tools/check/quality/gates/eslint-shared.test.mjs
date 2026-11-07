import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import {
  RESULTS_ENV,
  eslintCacheFile,
  eslintCacheKey,
  inDirs,
  sharedFindings,
} from "./eslint-shared.mjs";
import { METRIC_RULES } from "./check-baseline.mjs";
import { RULES as CONSTANT_RULES } from "../../code/constants/check-constants.mjs";
import { RULE as UI_TEXT_RULE } from "../../code/ui-text/check-ui-text.mjs";

const APP_DIR = fileURLToPath(new URL("../../../../", import.meta.url));
const CHECKS = {
  baseline: "tools/check/quality/gates/check-baseline.mjs",
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

// The inputs of the ESLint cache key (issue 1608) in a small app folder: the config, the lock file, the rule code, the
// rule filter of the shared pass, the lint config, core's source and config/gates. The web source is not one of them.
const KEYED_FILES = {
  "eslint.config.js": "export default [];\n",
  "package-lock.json": "{}\n",
  "tools/check/code/rule.mjs": "export const rule = 1;\n",
  "tools/check/quality/gates/filter.mjs": "export const filter = 1;\n",
  "config/lint/layout.config.mjs": "export default {};\n",
  "config/gates/quality-limits.json": '{ "default": { "maxLines": 200 } }\n',
  "config/gates/baselines/quality-baseline.json": "{}\n",
  "packages/core/src/enum.ts": 'export const X = ["a"] as const;\n',
};

function writeKeyedApp(dir) {
  for (const [name, text] of Object.entries(KEYED_FILES)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
}

describe("US-QG-01 ESLint cache key and file", () => {
  it("a change in the config, the lock file, the rule code, the rule filter or core's source changes the key", () =>
    withTempDir((dir) => {
      writeKeyedApp(dir);
      const before = eslintCacheKey(dir);
      for (const name of Object.keys(KEYED_FILES)) {
        const file = path.join(dir, name);
        const text = fs.readFileSync(file, "utf8");
        fs.writeFileSync(file, `${text}// changed\n`);
        assert.notEqual(eslintCacheKey(dir), before, name);
        fs.writeFileSync(file, text);
        assert.equal(eslintCacheKey(dir), before, `${name} restored`);
      }
    }));

  it("US-QG-01 (issue 1608): a change in a file under config/gates changes the key, also in a new file of its subfolder", () =>
    withTempDir((dir) => {
      writeKeyedApp(dir);
      const before = eslintCacheKey(dir);
      fs.writeFileSync(
        path.join(dir, "config/gates/quality-limits.json"),
        '{ "default": { "maxLines": 201 } }\n',
      );
      const limits = eslintCacheKey(dir);
      assert.notEqual(limits, before);
      fs.writeFileSync(path.join(dir, "config/gates/baselines/new-baseline.json"), "{}\n");
      assert.notEqual(eslintCacheKey(dir), limits);
    }));

  it("a file outside the keyed inputs, such as web source, leaves the key alone", () =>
    withTempDir((dir) => {
      writeKeyedApp(dir);
      const before = eslintCacheKey(dir);
      fs.mkdirSync(path.join(dir, "packages/web/src"), { recursive: true });
      fs.writeFileSync(path.join(dir, "packages/web/src/a.tsx"), "export {};\n");
      assert.equal(eslintCacheKey(dir), before);
    }));

  it("eslintCacheFile names the cache of the current key and removes older caches of its kind only", () =>
    withTempDir((dir) => {
      writeKeyedApp(dir);
      const folder = path.join(dir, ".cache", "gates");
      fs.mkdirSync(folder, { recursive: true });
      const old = `eslint-shared-${"0".repeat(64)}.json`;
      const otherKind = `eslint-lint-${"0".repeat(64)}.json`;
      const passResults = "eslint-shared-4242.json";
      for (const name of [old, otherKind, passResults])
        fs.writeFileSync(path.join(folder, name), "{}");
      assert.equal(
        eslintCacheFile("shared", dir),
        `.cache/gates/eslint-shared-${eslintCacheKey(dir)}.json`,
      );
      assert.equal(fs.existsSync(path.join(folder, old)), false);
      assert.equal(fs.existsSync(path.join(folder, otherKind)), true);
      assert.equal(fs.existsSync(path.join(folder, passResults)), true);
    }));

  it("`--cache-file lint` prints the lint cache file of this checkout", () => {
    const run = spawnSync(
      process.execPath,
      ["tools/check/quality/gates/eslint-shared.mjs", "--cache-file", "lint"],
      {
        cwd: APP_DIR,
        encoding: "utf8",
      },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /^\.cache\/gates\/eslint-lint-[0-9a-f]{64}\.json\n$/);
  });

  it("a real ESLint run with the cache reports the finding on the first run and on the cached run", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eslint-cache-"));
    try {
      fs.writeFileSync(path.join(dir, "a.js"), "foo();\n");
      const cacheLocation = path.join(dir, "cache.json");
      const plugin = {
        rules: {
          "no-foo": {
            create: (context) => ({
              Identifier(node) {
                if (node.name === "foo") context.report({ node, message: "no foo" });
              },
            }),
          },
        },
      };
      const lint = async () => {
        const eslint = new ESLint({
          cwd: dir,
          overrideConfigFile: true,
          overrideConfig: [
            { files: ["**/*.js"], plugins: { t: plugin }, rules: { "t/no-foo": "error" } },
          ],
          cache: true,
          cacheStrategy: "content",
          cacheLocation,
        });
        const [result] = await eslint.lintFiles(["a.js"]);
        return result.messages.map((m) => m.message);
      };
      assert.deepEqual(await lint(), ["no foo"]);
      assert.equal(fs.existsSync(cacheLocation), true);
      assert.deepEqual(await lint(), ["no foo"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
