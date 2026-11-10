import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test, describe } from "node:test";
import assert from "node:assert";
import { findDrift, readRepo } from "./check-ci-drift.mjs";

// The check and the repository it reads: the script in this folder, and the root four folders above it (US-QG-02).
const SCRIPT = fileURLToPath(new URL("./check-ci-drift.mjs", import.meta.url));
const ROOT = path.resolve(path.dirname(SCRIPT), "../../../..");

describe("US-DEV-01: CI drift checker", () => {
  test("US-DEV-01: returns empty findings for valid config", () => {
    const makefile = `
setup: ## Install dependencies
	npm ci

ci: ## Run all gates
	npm run gates && npm run test

test: ## Run tests
	npm test
`;

    const workflows = {
      "ci.yml": `
jobs:
  app:
    steps:
      - run: make setup
      - run: make ci
`,
    };

    const result = findDrift({ makefile, workflows });
    assert.deepStrictEqual(result.findings, []);
  });

  test("US-DEV-01: detects undefined make target", () => {
    const makefile = `
setup: ## Install dependencies
	npm ci

test: ## Run tests
	npm test
`;

    const workflows = {
      "ci.yml": `
jobs:
  app:
    steps:
      - run: make ci
`,
    };

    const result = findDrift({ makefile, workflows });
    assert(
      result.findings.some((f) => f.includes("make target 'ci' called in ci.yml but not defined")),
    );
  });

  test("US-DEV-01: requires ci.yml to call make ci", () => {
    const makefile = `
setup: ## Install dependencies
	npm ci

ci: ## Run all gates
	npm run gates

gates: ## Quick gates
	npm run lint
`;

    const workflows = {
      "ci.yml": `
jobs:
  app:
    steps:
      - run: make setup
      - run: make gates
`,
    };

    const result = findDrift({ makefile, workflows });
    assert(result.findings.some((f) => f.includes("ci.yml must call make ci")));
  });

  test("US-DEV-01: flags npm calls not in allowlist", () => {
    const makefile = `
setup: ## Install dependencies
	npm ci

ci: ## Run all gates
	npm run gates
`;

    const workflows = {
      "ci.yml": `
jobs:
  app:
    steps:
      - run: make setup
      - run: npm run test
      - run: make ci
`,
    };

    const result = findDrift({ makefile, workflows });
    assert(
      result.findings.some(
        (f) => f.includes("direct npm/npx/node call") && f.includes("npm run test"),
      ),
    );
  });

  test("US-DEV-01: allows npm ci in setup context", () => {
    const makefile = `
setup: ## Install dependencies
	npm ci

ci: ## Run all gates
	npm run gates
`;

    const workflows = {
      "setup.yml": `
jobs:
  app:
    steps:
      - run: npm ci
      - run: make ci
`,
    };

    const result = findDrift({ makefile, workflows });
    // npm ci is allowlisted
    assert(!result.findings.some((f) => f.includes("npm ci")));
  });

  test("US-DEV-01: detects undocumented make targets as hints", () => {
    const makefile = `
setup: ## Install dependencies
	npm ci

test:
	npm test

ci: ## Run all gates
	npm run gates
`;

    const workflows = {
      "ci.yml": `
jobs:
  app:
    steps:
      - run: make setup
      - run: make ci
`,
    };

    const result = findDrift({ makefile, workflows });
    assert.deepStrictEqual(result.findings, []);
    assert(result.hints.some((h) => h.includes("target 'test' has no ## description")));
  });

  test("US-DEV-01: parses multiline run blocks", () => {
    const makefile = `
setup: ## Install dependencies
	npm ci

test: ## Run tests
	npm test

ci: ## Run all gates
	npm run gates
`;

    const workflows = {
      "ci.yml": `
jobs:
  app:
    steps:
      - run: |
          make setup
          make test
          make ci
`,
    };

    const result = findDrift({ makefile, workflows });
    assert.deepStrictEqual(result.findings, []);
  });

  test("US-DEV-01: extracts make targets from multiple run styles", () => {
    const makefile = `
a: ## Target a
	echo a

b: ## Target b
	echo b

c: ## Target c
	echo c

ci: ## Run ci
	echo ci
`;

    const workflows = {
      "test.yml": `
jobs:
  job1:
    steps:
      - run: make a
      - run: |
          make b
          make c
      - run: make ci
`,
    };

    const result = findDrift({ makefile, workflows });
    assert.deepStrictEqual(result.findings, []);
  });

  test("US-DEV-01: handles YAML properties without breaking on run:", () => {
    const makefile = `
setup: ## Install
	npm ci

ci: ## Run ci
	npm test
`;

    const workflows = {
      "ci.yml": `
jobs:
  app:
    env:
      NODE_ENV: test
    steps:
      - run: make setup
      - name: Test step
        run: make ci
`,
    };

    const result = findDrift({ makefile, workflows });
    assert.deepStrictEqual(result.findings, []);
  });

  test("US-DEV-01: extracts valid make target names", () => {
    const makefile = `
hello-world: ## Target with hyphens
	echo ok

test123: ## Invalid? no, lowercase with numbers
	echo ok

_invalid: ## Underscore start is invalid
	echo ok

Uppercase: ## Invalid start
	echo ok

valid-target-name: ## Good
	echo ok

ci: ## Special
	echo ci
`;

    const workflows = {
      "test.yml": `
jobs:
  job:
    steps:
      - run: make hello-world
      - run: make test123
      - run: make valid-target-name
      - run: make ci
`,
    };

    const result = findDrift({ makefile, workflows });
    // All should be valid (even test123 and underscore targets are extracted from Makefile)
    assert.deepStrictEqual(result.findings, []);
  });
});

describe("US-QG-02: the drift check reads the repository and never passes on nothing", () => {
  const PARTS = `ci-gates: ## Part 1
	npm run gates

ci-tests-base: ## Part 2a
	npm test

ci-tests-web: ## Part 2b
	npm test

ci-coverage: ## Part 2c
	npm run coverage

ci-ui: ## Part 3
	npm run ui
`;
  const ciYml = (...lines) =>
    `jobs:\n  app:\n    steps:\n${lines.map((line) => `      - run: ${line}`).join("\n")}\n`;

  test("US-QG-02: a CI workflow that calls every part of make ci passes; one that misses a part names the missing one", () => {
    const all = ciYml(
      "make ci-gates",
      "make ci-tests-base",
      "make ci-tests-web",
      "make ci-coverage",
      "make ci-ui",
    );
    assert.deepStrictEqual(
      findDrift({ makefile: PARTS, workflows: { "ci.yml": all } }).findings,
      [],
    );
    const missing = ciYml("make ci-gates", "make ci-tests-base", "make ci-tests-web", "make ci-ui");
    const { findings } = findDrift({ makefile: PARTS, workflows: { "ci.yml": missing } });
    assert.equal(findings.length, 1);
    assert.match(
      findings[0],
      /ci\.yml must call make ci, or every part of it \(FR-QG-01\): missing ci-coverage$/,
    );
  });

  test("US-QG-02: a make call with a flag names its target, and a missing target is found", () => {
    const { findings } = findDrift({
      makefile: PARTS,
      workflows: {
        "ci.yml": ciYml(
          "make -s ci-gates",
          "make -j3 -Otarget missing-target",
          "make ci-tests-base",
        ),
      },
    });
    assert.deepStrictEqual(
      findings.filter((f) => f.includes("not defined")),
      ["make target 'missing-target' called in ci.yml but not defined in Makefile"],
    );
  });

  test("US-DEV-01: a direct npm, npx or node call is flagged wherever it starts a command; an actions/ folder does not allow it", () => {
    const makefile = "ci: ## Run ci\n\tnpm run gates\n";
    for (const cmd of [
      "node app/tools/workflow/actions/x/x.mjs event",
      "cd app && npm run test",
      "echo ok; npx playwright install",
      "npm ci && npm test",
    ]) {
      const { findings } = findDrift({ makefile, workflows: { "ci.yml": ciYml(cmd, "make ci") } });
      assert.ok(
        findings.some((f) => f.includes(cmd)),
        cmd,
      );
    }
    // The allowance is the bare setup command, and no other.
    assert.deepStrictEqual(
      findDrift({ makefile, workflows: { "ci.yml": ciYml("npm ci", "make ci") } }).findings,
      [],
    );
  });

  test("US-QG-02: readRepo fails without a Makefile and without workflows, and reads the workflows it finds", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ci-drift-root-"));
    try {
      assert.throws(() => readRepo(root), /no Makefile at /);
      fs.writeFileSync(path.join(root, "Makefile"), "ci: ## Run ci\n\tnpm run gates\n");
      assert.throws(() => readRepo(root), /no workflow \(\.yml or \.yaml\) in /);
      fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
      fs.writeFileSync(path.join(root, ".github", "workflows", "ci.yml"), ciYml("make ci"));
      assert.deepStrictEqual(Object.keys(readRepo(root).workflows), ["ci.yml"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("US-QG-02: the check reads the same files from app/, from the root and from any other folder, and passes on the repository", () => {
    const runs = [ROOT, path.join(ROOT, "app"), os.tmpdir()].map((cwd) =>
      spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" }),
    );
    for (const run of runs) {
      assert.equal(run.stderr, "");
      assert.equal(run.status, 0, run.stdout);
      assert.equal(run.stdout, runs[0].stdout);
    }
    assert.ok(runs[0].stdout.includes(`checked against ${ROOT}/Makefile`), runs[0].stdout);
  });

  test("US-QG-02: the check fails loudly, with a message and exit 1, when the tree it finds has no Makefile or no workflow", (t) => {
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), "ci-drift-tree-"));
    t.after(() => fs.rmSync(tree, { recursive: true, force: true }));
    // A copy of the script at the same depth: its root is the temporary tree, which has nothing in it yet.
    const folder = path.join(tree, "app", "tools", "check", "release");
    fs.mkdirSync(folder, { recursive: true });
    fs.copyFileSync(SCRIPT, path.join(folder, "check-ci-drift.mjs"));
    const run = () =>
      spawnSync(process.execPath, [path.join(folder, "check-ci-drift.mjs")], {
        cwd: tree,
        encoding: "utf8",
      });
    let result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^check-ci-drift: error: no Makefile at /);
    fs.writeFileSync(path.join(tree, "Makefile"), "ci: ## Run ci\n\tnpm run gates\n");
    result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^check-ci-drift: error: no workflow \(\.yml or \.yaml\) in /);
    fs.mkdirSync(path.join(tree, ".github", "workflows"), { recursive: true });
    fs.writeFileSync(path.join(tree, ".github", "workflows", "ci.yml"), ciYml("make ci"));
    result = run();
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /checked against .*Makefile/);
  });
});

describe("FR-QG-01: the Makefile", () => {
  test("FR-QG-01: every documented target is declared in .PHONY (typo guard)", () => {
    const lines = fs
      .readFileSync(new URL("../../../../Makefile", import.meta.url), "utf8")
      .split("\n");
    const phony = new Set(
      lines
        .find((l) => l.startsWith(".PHONY:"))
        .split(":")[1]
        .split(/\s+/),
    );
    const documented = lines.flatMap((l) => l.match(/^([a-z][a-z0-9-]*):.*## /)?.[1] ?? []);
    assert.deepStrictEqual(
      documented.filter((t) => !phony.has(t)),
      [],
    );
  });
});

describe("US-DEV-01: make help", () => {
  test("US-DEV-01: make help lists every target that has a ## description, digits in the name included", () => {
    const lines = fs
      .readFileSync(new URL("../../../../Makefile", import.meta.url), "utf8")
      .split("\n");
    const described = lines.flatMap((l) => l.match(/^([a-z0-9][a-z0-9-]*):.*## /)?.[1] ?? []);
    assert.ok(described.length > 0, "no target with a ## description found");
    // The help recipe runs directly with bash, not through make: knip flags an unlisted make binary in test files
    // (the gate that rejected a spawned make), so this test needs no make binary. The recipe is the real one from the
    // Makefile, with make's expansions applied: $$ becomes $, and $(MAKEFILE_LIST) becomes two files, the Makefile and
    // a second file as in a worktree with .env.worktree, so grep sees more than one file.
    const start = lines.findIndex((l) => l.startsWith("help: ## "));
    assert.ok(start >= 0, "no help target");
    const recipe = lines[start + 1];
    assert.match(recipe, /^\t@grep /, "the help recipe is not on the line after help:");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "make-help-"));
    try {
      const envFile = path.join(dir, ".env.worktree");
      fs.writeFileSync(envFile, "PFLANZENDEX_TEST_DB_PORT=54517\n");
      const command = recipe
        .replace(/^\t@/, "")
        .replaceAll("$$", () => "$")
        .replaceAll("$(MAKEFILE_LIST)", () => `Makefile '${envFile}'`);
      const help = spawnSync("bash", ["-c", command], {
        cwd: fileURLToPath(new URL("../../../../", import.meta.url)),
        encoding: "utf8",
      });
      assert.equal(help.status, 0, help.stderr);
      // The first column of each help line is the target name.
      const listed = new Set(help.stdout.split("\n").map((l) => l.trim().split(/\s+/)[0]));
      assert.deepStrictEqual(
        described.filter((t) => !listed.has(t)),
        [],
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
