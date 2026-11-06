import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test, describe } from "node:test";
import assert from "node:assert";
import { findDrift } from "./check-ci-drift.mjs";

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
