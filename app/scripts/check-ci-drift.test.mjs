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
