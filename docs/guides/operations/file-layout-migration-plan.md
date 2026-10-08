# File layout: implementation plan (FR-QG-21 to FR-QG-23)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The file layout of the repo is written down in one configuration and checked by a script on every push and in CI, with a baseline that only shrinks; then the existing disorder is moved into the target layout step by step.

**Architecture:** Pure functions over a list of repo-relative paths (`git ls-files`) apply the rules LY-1 to LY-5 and return findings; a second pure module compares the findings with `app/config/gates/baselines/layout-baseline.json` (LY-6); a thin CLI reads git and the config and sets the exit code. Because the rules are pure, every rule is tested with an in-memory path list.

**Tech Stack:** Node ESM (`.mjs`), `node:test` (like the other scripts in `app/scripts/`), no new dependency.

**Spec:** `docs/specs/product/18-architecture-and-quality-gates.md` (`US-QG-09`, `FR-QG-21`, `FR-QG-22`, `FR-QG-23`, gate `QG-C4`) and `docs/adr/0008-formal-file-layout.md`. Issue: #388.

## Global Constraints

- At most **5 units** per directory; files with the same name stem count once; a directory counts as one unit (assumption, set by the project owner on 2026-10-05).
- Names are **kebab-case**; entries starting with `.` are ignored; conventional root names (`README.md`, `Makefile`, `LICENSE`, ...) are exempt.
- A component `x.tsx` lives in a directory `x/`; barrels (`index.ts`) only per module.
- The baseline **only shrinks**: stale entries fail, entries that `dev` does not have fail, the write command refuses to enlarge it.
- Script files have at most 200 lines (PRIN-004, tests excluded); ESLint complexity limits apply (`app/config/lint/eslint.config.js`).
- Everything in the repo is English; commits are Conventional Commits with the scope `qg`; no `--no-verify`; PR title is a Conventional Commit and names `FR-QG-21`.
- Gate files (check scripts, `Makefile`, `package.json` gate list, hooks, workflows, thresholds, `.claude/`) are changed in PRs that **a human merges** (ADR 0005). Agents never merge those.
- Numbers (5 units, 10 features per module) are starting values, not measured (assumption).

## Review Focus

These inputs are implied by the spec but not named in its criteria; each has a test in the task that owns the code.

- A path with spaces or non-ASCII characters (`größe.md`, `a b.md`): `git ls-files` quotes these unless `-z` is used (Task 3).
- A tracked file deleted in the working tree but not yet staged, and a new untracked file: the check must see the state that would be committed, not a stale index (Task 3).
- A directory and a file with the same stem (`badge/` and `badge.tsx`) form one unit, otherwise every component folder would count twice (Task 1).
- An empty baseline `{}` or a missing baseline file: the first run must be able to create it, a damaged file must give a readable error, not a stack trace (Task 3 and Task 4).
- `origin/dev` missing in CI: the "baseline must not grow" comparison must fail there instead of silently passing (Task 3, `CI` variable).

## Measured starting point (prototype run on 2026-10-05, `dev` at `3dd5389`)

The prototype of the code below, run over the tracked files of `dev`, reports **98 findings**: LY-1 in 72 directories, LY-3 in 14, LY-4 in 11 and LY-5 at the root (`docs/guides/reference/design-system.md`, `Docs`, `scripts`). The biggest: `web/src/collection` 46 units, `docs/records/test-logs/issue-297` 44, `app/scripts` 38, `docs/records/test-logs` 37. The generated baseline is about 110 lines of JSON. The real numbers are produced again in Task 4 and may differ slightly.

## Pull requests

| PR  | Content                                                                                                 | Merge     | Plan                    |
| --- | ------------------------------------------------------------------------------------------------------- | --------- | ----------------------- |
| 0   | Spec and ADR 0008 (#391)                                                                                | agent     | done                    |
| 1   | Check, config, baseline, `make layout` in gates, principle PRIN-011 (Tasks 1 to 6)                      | **human** | this document           |
| 2   | `npm run layout-fix` (dry run, apply, import rewrite; done)                                             | agent     | outline below, own plan |
| 3   | Root and `docs/`: rename, whitelist, links; touches `CLAUDE.md`, `AGENTS.md`, `.claude/`, `CODEOWNERS`  | **human** | outline below, own plan |
| 4a  | Move `app/scripts` (48 units) into `app/tools/{check,workflow,dev}`; one PR, mechanical, a human merges | **human** | outline below, own plan |
| 4   | Root `scripts/*.sh` to `tools/`, `app/config`, `app/gates` (Makefile, CI, hooks adapt)                  | **human** | outline below, own plan |
| 5   | `core` and `api`, one PR per module                                                                     | agent     | outline below, own plan |
| 6   | `web`: `app/`, `shared/`, `components/ui`, then one PR per module                                       | agent     | outline below, own plan |
| 7   | Touch-it rule, ceilings per release, closes #388                                                        | **human** | outline below, own plan |

PR 3 needs a human because the rename of `Docs/` changes paths in files that agents may not change alone (`CLAUDE.md`, `AGENTS.md`, `.claude/`, `.github/CODEOWNERS`, see the "Gates you must not weaken" section of `AGENTS.md`). PRs 2, 5 and 6 contain no gate file and go through `make merge`.

---

## PR 1: check, config, baseline

Branch `chore/qg-21-layout-check`, created with `make worktree BRANCH=chore/qg-21-layout-check` (the issue is already claimed by the same account). Run `make setup` in the new worktree. All paths below are relative to the repo root; commands that start with `cd app` assume the worktree root.

The code in Tasks 1 to 3 was written and run as a prototype before this plan: 25 tests passed, `eslint` was clean after `prettier --write`, and the CLI behaved as described in the four scenarios of Task 4. Copy it as written.

### Task 1: Tree helpers and rules LY-1 to LY-5

**Files:**

- Create: `app/scripts/layout-tree.mjs`
- Create: `app/scripts/layout-rules.mjs`
- Test: `app/scripts/layout-rules.test.mjs`

**Interfaces:**

- Produces from `layout-tree.mjs`: `isKebab(name)`, `stemOf(name)`, `isIgnored(path)`, `buildTree(paths)` (`Map<dir, Map<name, "file"|"dir">>`, root is `""`), `unitCount(children)`, `matchDir(pattern, dir)` (`*` is one segment).
- Produces from `layout-rules.mjs`: `findLayout(paths, config)` returning `{ rule, dir, value, items }[]` where `rule` is `LY-1` to `LY-5`, `dir` is `"."` for the root and `value` is the number counted (units for LY-1, offending entries otherwise).
- Config shape read by the rules: `{ maxUnits, rootFiles, rootDirs, namedFiles, componentRoots, componentExempt, dirs: [{ path, collection?: RegExp, maxUnits?: number }] }`.

- [ ] **Step 1: Write the failing test** `app/scripts/layout-rules.test.mjs`

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findLayout } from "./layout-rules.mjs";
import { unitCount, isIgnored } from "./layout-tree.mjs";

const config = {
  maxUnits: 5,
  rootFiles: ["README.md", "Makefile"],
  rootDirs: ["app", "docs"],
  namedFiles: ["README.md", "Makefile"],
  componentRoots: ["app/web"],
  componentExempt: ["main"],
  dirs: [{ path: "app/migrations", collection: /^\d{4}_[a-z_]+\.sql$/ }],
};
const run = (paths, extra = {}) => findLayout(paths, { ...config, ...extra });
const rules = (fs) => fs.map((f) => `${f.rule} ${f.dir}`);
const files = (dir, n) =>
  Array.from({ length: n }, (_, i) => `${dir}/f${i}.md`);

describe("US-QG-09 LY-1 fan-out", () => {
  it("fails a directory with more than 5 units and names path and count", () => {
    const f = run(files("app/x", 6));
    assert.deepEqual(rules(f), ["LY-1 app/x"]);
    assert.equal(f[0].value, 6);
  });
  it("accepts exactly 5 units", () =>
    assert.deepEqual(run(files("app/x", 5)), []));
  it("counts files with the same stem once", () => {
    const paths = [
      "card.tsx",
      "card.test.tsx",
      "card.stories.tsx",
      "a.ts",
      "b.ts",
      "c.ts",
      "d.ts",
    ].map((n) => `app/x/${n}`);
    assert.equal(
      unitCount(new Map(paths.map((p) => [p.split("/")[2], "file"]))),
      5,
    );
    assert.deepEqual(run(paths), []);
  });
  it("counts a directory and a file with the same stem once", () => {
    assert.deepEqual(run([...files("app/x", 4), "app/x/f0/a.ts"]), []);
  });
  it("counts a directory as one unit", () => {
    assert.deepEqual(rules(run([...files("app/x", 5), "app/x/sub/a.ts"])), [
      "LY-1 app/x",
    ]);
  });
  it("ignores entries starting with a dot", () => {
    assert.equal(isIgnored(".claude/rules/a.md"), true);
    assert.deepEqual(
      run([...files("app/x", 5), "app/x/.hidden", ".github/a.yml"]),
      [],
    );
  });
  it("honours a per-directory limit", () => {
    assert.deepEqual(
      run(files("app/x", 8), { dirs: [{ path: "app/*", maxUnits: 10 }] }),
      [],
    );
  });
});

describe("US-QG-09 LY-2 collections", () => {
  const sql = (n) => `app/migrations/${String(n).padStart(4, "0")}_a.sql`;
  it("exempts a collection from the limit when every entry matches", () => {
    assert.deepEqual(run(Array.from({ length: 30 }, (_, i) => sql(i))), []);
  });
  it("fails an entry that does not match the pattern", () => {
    const f = run([sql(1), "app/migrations/notes.md"]);
    assert.deepEqual(rules(f), ["LY-2 app/migrations"]);
    assert.deepEqual(f[0].items, ["notes.md"]);
  });
});

describe("US-QG-09 LY-3 names", () => {
  it("fails names that are not kebab-case", () => {
    const f = run([
      "app/x/CamelCase.ts",
      "app/x/snake_case.ts",
      "app/Big/a.ts",
      "app/x/ok-name.ts",
    ]);
    assert.deepEqual(rules(f).sort(), ["LY-3 app", "LY-3 app/x"]);
  });
  it("accepts conventional file names and dots in the extension", () => {
    assert.deepEqual(
      run(["README.md", "Makefile", "app/x/a.test.tsx", "app/x/b.d.mts"]),
      [],
    );
  });
});

describe("US-QG-09 LY-4 component folders", () => {
  it("fails a component file that is not in a folder of the same name", () => {
    const f = run(["app/web/badge.tsx", "app/web/badge.test.tsx"]);
    assert.deepEqual(rules(f), ["LY-4 app/web"]);
  });
  it("accepts a component in its own folder and exempt entry points", () => {
    assert.deepEqual(
      run([
        "app/web/badge/badge.tsx",
        "app/web/badge/badge.test.tsx",
        "app/web/main.tsx",
      ]),
      [],
    );
  });
  it("only applies below the component roots", () => {
    assert.deepEqual(run(["app/other/thing.tsx"]), []);
  });
});

describe("US-QG-09 LY-5 repo root", () => {
  it("fails files and directories that are not on the whitelist", () => {
    const f = run(["README.md", "NOTES.md", "scripts/a.sh", "app/a.ts"]);
    assert.deepEqual(
      rules(f).filter((r) => r.startsWith("LY-5")),
      ["LY-5 ."],
    );
    assert.deepEqual(f.find((x) => x.rule === "LY-5").items.sort(), [
      "NOTES.md",
      "scripts",
    ]);
  });
  it("does not count whitelisted root files towards the limit", () => {
    assert.deepEqual(
      run(["README.md", "Makefile", "app/a.ts", "docs/a.md"]),
      [],
    );
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `cd app && node --test scripts/layout-rules.test.mjs`
Expected: FAIL with `Cannot find module './layout-rules.mjs'`.

- [ ] **Step 3: Write the implementation** `app/scripts/layout-tree.mjs`

```js
// Pure helpers over repo-relative POSIX paths (US-QG-09, FR-QG-21). No file system access.

// kebab-case: lower-case letters and digits, separated by single dashes.
export const isKebab = (name) =>
  name.split("-").every((part) => /^[a-z0-9]+$/.test(part));

// "card.test.tsx" -> "card": files of one unit share the name before the first dot.
export const stemOf = (name) => name.split(".")[0];

// Entries starting with "." (tooling folders, dotfiles) are not part of the layout.
export const isIgnored = (p) => p.split("/").some((s) => s.startsWith("."));

// Map<dir, Map<name, "file" | "dir">>; the root directory is "".
export function buildTree(paths) {
  const tree = new Map([["", new Map()]]);
  for (const p of paths) {
    const parts = p.split("/");
    parts.forEach((name, i) => {
      const dir = parts.slice(0, i).join("/");
      const isFile = i === parts.length - 1;
      if (!tree.has(dir)) tree.set(dir, new Map());
      tree.get(dir).set(name, isFile ? "file" : "dir");
      if (!isFile) {
        const child = parts.slice(0, i + 1).join("/");
        if (!tree.has(child)) tree.set(child, new Map());
      }
    });
  }
  return tree;
}

// A unit is a directory or a group of files with the same stem (LY-1).
export function unitCount(children) {
  return new Set(
    [...children].map(([name, kind]) => (kind === "dir" ? name : stemOf(name))),
  ).size;
}

// "*" matches exactly one path segment.
export function matchDir(pattern, dir) {
  const a = pattern.split("/");
  const b = dir.split("/");
  return a.length === b.length && a.every((s, i) => s === "*" || s === b[i]);
}
```

`app/scripts/layout-rules.mjs`

```js
// Rules LY-1 to LY-5 over a path list. Returns findings { rule, dir, value, items }.
import {
  isKebab,
  buildTree,
  isIgnored,
  matchDir,
  stemOf,
  unitCount,
} from "./layout-tree.mjs";

const finding = (rule, dir, items) => ({
  rule,
  dir: dir || ".",
  value: items.length,
  items,
});
const isTestOrStory = (n) => /\.(test|stories)\.tsx?$/.test(n);

function nameOk(name, kind, config) {
  if (kind === "file" && config.namedFiles.includes(name)) return true;
  return isKebab(kind === "dir" ? name : stemOf(name));
}

function rootFindings(children, config) {
  const bad = [...children]
    .filter(
      ([n, k]) =>
        !(k === "file" ? config.rootFiles : config.rootDirs).includes(n),
    )
    .map(([n]) => n);
  return bad.length ? [finding("LY-5", "", bad)] : [];
}

function fanoutFindings(dir, children, rule, config) {
  const counted =
    dir === ""
      ? [...children].filter(([n]) => !config.rootFiles.includes(n))
      : children;
  const units = unitCount(new Map(counted));
  const limit = rule?.maxUnits ?? config.maxUnits;
  if (units <= limit) return [];
  return [
    {
      rule: "LY-1",
      dir: dir || ".",
      value: units,
      items: [`${units} units, limit ${limit}`],
    },
  ];
}

function dirFindings(dir, children, config) {
  const rule = config.dirs.find((r) => matchDir(r.path, dir));
  const out = dir === "" ? rootFindings(children, config) : [];
  if (rule?.collection) {
    const bad = [...children.keys()].filter((n) => !rule.collection.test(n));
    return bad.length ? [...out, finding("LY-2", dir, bad)] : out;
  }
  out.push(...fanoutFindings(dir, children, rule, config));
  const badNames = [...children]
    .filter(([n, k]) => !nameOk(n, k, config))
    .map(([n]) => n);
  return badNames.length ? [...out, finding("LY-3", dir, badNames)] : out;
}

// LY-4: a component x.tsx lives in a directory x/.
function componentFindings(paths, config) {
  const byDir = new Map();
  for (const p of paths) {
    const parts = p.split("/");
    const name = parts.at(-1);
    const dir = parts.slice(0, -1).join("/");
    if (
      !config.componentRoots.some((r) => dir === r || dir.startsWith(`${r}/`))
    )
      continue;
    if (!name.endsWith(".tsx") || isTestOrStory(name)) continue;
    if (config.componentExempt.includes(stemOf(name))) continue;
    if (parts.at(-2) === stemOf(name)) continue;
    byDir.set(dir, [...(byDir.get(dir) ?? []), name]);
  }
  return [...byDir].map(([dir, items]) => finding("LY-4", dir, items));
}

export function findLayout(allPaths, config) {
  const paths = allPaths.filter((p) => !isIgnored(p));
  const findings = [...buildTree(paths)].flatMap(([dir, kids]) =>
    dirFindings(dir, kids, config),
  );
  return [...findings, ...componentFindings(paths, config)];
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `cd app && node --test scripts/layout-rules.test.mjs`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add app/scripts/layout-tree.mjs app/scripts/layout-rules.mjs app/scripts/layout-rules.test.mjs
git commit -m "chore(qg): add the layout rules LY-1 to LY-5 as pure functions (FR-QG-21, US-QG-09)"
```

End the commit message with the attribution lines of the session.

### Task 2: Baseline ratchet (LY-6)

**Files:**

- Create: `app/scripts/layout-baseline.mjs`
- Test: `app/scripts/layout-baseline.test.mjs`

**Interfaces:**

- Consumes: findings from Task 1 (`{ rule, dir, value, items }`).
- Produces: `toBaseline(findings)` returning `{ "LY-1": { "<dir>": <value> }, ... }` sorted by rule and directory; `compareBaseline(findings, baseline, devBaseline?)` returning `string[]` of problems (empty is green). Messages that start with `LY-6` are baseline-maintenance problems (stale or grown against dev); all others are real violations.

- [ ] **Step 1: Write the failing test** `app/scripts/layout-baseline.test.mjs`

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareBaseline, toBaseline } from "./layout-baseline.mjs";

const f = (rule, dir, value, items = ["x"]) => ({ rule, dir, value, items });

describe("US-QG-09 LY-6 baseline ratchet", () => {
  it("toBaseline stores one value per rule and directory, sorted", () => {
    assert.deepEqual(
      toBaseline([f("LY-3", "b", 2), f("LY-1", "z", 7), f("LY-1", "a", 6)]),
      {
        "LY-1": { a: 6, z: 7 },
        "LY-3": { b: 2 },
      },
    );
  });
  it("passes when findings match the baseline exactly", () => {
    assert.deepEqual(
      compareBaseline([f("LY-1", "a", 6)], { "LY-1": { a: 6 } }),
      [],
    );
  });
  it("fails a violation that is not in the baseline", () => {
    const e = compareBaseline([f("LY-1", "a", 6)], {});
    assert.match(e[0], /^LY-1 a: 6 .*not allowed/);
  });
  it("fails a baselined directory that got worse", () => {
    assert.match(
      compareBaseline([f("LY-1", "a", 7)], { "LY-1": { a: 6 } })[0],
      /^LY-1 a: 7, baseline allows 6/,
    );
  });
  it("fails a stale entry: lower value or no longer violating", () => {
    assert.match(
      compareBaseline([f("LY-1", "a", 5)], { "LY-1": { a: 6 } })[0],
      /^LY-6 LY-1 a: now 5.*lower the entry/,
    );
    assert.match(
      compareBaseline([], { "LY-1": { a: 6 } })[0],
      /^LY-6 LY-1 a: no longer violates; delete the entry/,
    );
  });
  it("fails entries that are new or higher compared with dev", () => {
    const base = { "LY-1": { a: 6, b: 3 } };
    const findings = [f("LY-1", "a", 6), f("LY-1", "b", 3)];
    const e = compareBaseline(findings, base, { "LY-1": { a: 5 } });
    assert.equal(e.length, 2);
    assert.match(e[0], /a: 6 is higher than 5 on dev/);
    assert.match(e[1], /b: entry is not on dev/);
  });
  it("accepts a baseline that only shrank against dev", () => {
    assert.deepEqual(
      compareBaseline(
        [f("LY-1", "a", 5)],
        { "LY-1": { a: 5 } },
        { "LY-1": { a: 6, b: 3 } },
      ),
      [],
    );
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `cd app && node --test scripts/layout-baseline.test.mjs`
Expected: FAIL with `Cannot find module './layout-baseline.mjs'`.

- [ ] **Step 3: Write the implementation** `app/scripts/layout-baseline.mjs`

```js
// LY-6: the baseline only shrinks (FR-QG-22). Shape: { "LY-1": { "<dir>": <value> }, ... }.

export function toBaseline(findings) {
  const out = {};
  for (const f of [...findings].sort((a, b) => a.dir.localeCompare(b.dir))) {
    (out[f.rule] ??= {})[f.dir] = f.value;
  }
  return Object.fromEntries(
    Object.entries(out).sort(([a], [b]) => a.localeCompare(b)),
  );
}

const hint = (f) =>
  `${f.items.slice(0, 3).join(", ")}${f.items.length > 3 ? ", ..." : ""}`;

// Compares the measured findings with the baseline and, when given, with the baseline on dev.
export function compareBaseline(findings, baseline, devBaseline) {
  const errors = [];
  const seen = new Set();
  for (const f of findings) {
    const known = baseline[f.rule]?.[f.dir];
    seen.add(`${f.rule} ${f.dir}`);
    if (known === undefined)
      errors.push(
        `${f.rule} ${f.dir}: ${f.value} (${hint(f)}); fix it, new violations are not allowed`,
      );
    else if (f.value > known)
      errors.push(
        `${f.rule} ${f.dir}: ${f.value}, baseline allows ${known}; the directory got worse`,
      );
    else if (f.value < known)
      errors.push(
        `LY-6 ${f.rule} ${f.dir}: now ${f.value}, baseline says ${known}; lower the entry`,
      );
  }
  for (const [rule, dirs] of Object.entries(baseline))
    for (const dir of Object.keys(dirs))
      if (!seen.has(`${rule} ${dir}`))
        errors.push(
          `LY-6 ${rule} ${dir}: no longer violates; delete the entry`,
        );
  if (devBaseline)
    for (const [rule, dirs] of Object.entries(baseline))
      for (const [dir, value] of Object.entries(dirs)) {
        const dev = devBaseline[rule]?.[dir];
        if (dev === undefined)
          errors.push(
            `LY-6 ${rule} ${dir}: entry is not on dev; the baseline must not get new entries`,
          );
        else if (value > dev)
          errors.push(
            `LY-6 ${rule} ${dir}: ${value} is higher than ${dev} on dev`,
          );
      }
  return errors;
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `cd app && node --test scripts/layout-baseline.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add app/scripts/layout-baseline.mjs app/scripts/layout-baseline.test.mjs
git commit -m "chore(qg): add the layout baseline ratchet LY-6 (FR-QG-22, US-QG-09)"
```

### Task 3: Configuration and CLI

**Files:**

- Create: `app/config/lint/layout.config.mjs`
- Create: `app/scripts/check-layout.mjs`
- Test: `app/scripts/check-layout.test.mjs`

**Interfaces:**

- Consumes: `findLayout` (Task 1), `compareBaseline` and `toBaseline` (Task 2).
- Produces: `listPaths(cwd = repoRoot)` (tracked plus untracked-not-ignored files, minus files deleted in the working tree, unquoted via `-z`) and `BASELINE_FILE` (absolute path of `app/config/gates/baselines/layout-baseline.json`); CLI `node scripts/check-layout.mjs [--write-baseline]`. Exit 0 is green, exit 1 prints one problem per line. Environment: `LAYOUT_BASE` (default `origin/dev`), `CI` (a missing base ref is an error).

- [ ] **Step 1: Write the failing test** `app/scripts/check-layout.test.mjs` (the "repo passes" test is added in Task 4, when the baseline exists)

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listPaths } from "./check-layout.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, stdio: "ignore" });

describe("US-QG-09 listPaths", () => {
  it("lists tracked and new files unquoted and skips files deleted in the working tree", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layout-"));
    try {
      git(dir, "init", "-q");
      for (const f of ["größe.md", "a b.md", "gone.md"])
        fs.writeFileSync(path.join(dir, f), "");
      git(dir, "add", "-A");
      git(
        dir,
        "-c",
        "user.email=t@t",
        "-c",
        "user.name=t",
        "commit",
        "-qm",
        "x",
      );
      fs.rmSync(path.join(dir, "gone.md"));
      fs.writeFileSync(path.join(dir, "new.md"), "");
      assert.deepEqual(listPaths(dir).sort(), ["a b.md", "größe.md", "new.md"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `cd app && node --test scripts/check-layout.test.mjs`
Expected: FAIL with `Cannot find module './check-layout.mjs'`.

- [ ] **Step 3: Write the configuration** `app/config/lint/layout.config.mjs`

It describes the **target** layout. What does not match yet is in the baseline.

```js
// Single source for the file layout (FR-QG-21). Describes the TARGET layout; what does not
// match yet is listed in layout-baseline.json and only shrinks (FR-QG-22).
const story = "[a-z0-9][a-z0-9-]*";
export default {
  maxUnits: 5,
  rootFiles: [
    "README.md",
    "LICENSE",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CLAUDE.md",
    "AGENTS.md",
    "Makefile",
  ],
  rootDirs: ["app", "docs", "tools"],
  // Conventional names that are exempt from kebab-case (LY-3).
  namedFiles: [
    "README.md",
    "LICENSE",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CLAUDE.md",
    "AGENTS.md",
    "Makefile",
    "CODEOWNERS",
    "Dockerfile",
  ],
  componentRoots: ["app/packages/web/src"],
  componentExempt: ["main", "routes"],
  // First match wins; "*" is one path segment. A collection has no entry limit but a name pattern (LY-2).
  dirs: [
    {
      path: "app/packages/db/migrations",
      collection: /^\d{4}_[a-z0-9_]+\.sql$/,
    },
    {
      path: "docs/specs/product",
      collection: /^(\d{2}-[a-z0-9-]+|readme)\.md$/,
    },
    {
      path: "docs/specs/prototype",
      collection: /^(\d{2}-[a-z0-9-]+|readme)\.md$/,
    },
    { path: "docs/adr", collection: /^\d{4}-[a-z0-9-]+\.md$/ },
    {
      path: "docs/guides/principles",
      collection: /^(prin-\d{3}-[a-z0-9-]+|readme)\.md$/,
    },
    {
      path: "docs/records/test-logs",
      collection: new RegExp(`^${story}(\\.md)?$`),
    },
    {
      path: "docs/records/test-logs/*",
      collection: new RegExp(`^${story}\\.(png|md|txt|json)$`),
    },
  ],
};
```

- [ ] **Step 4: Write the CLI** `app/scripts/check-layout.mjs`

```js
// QG-C4 file layout gate (US-QG-09, FR-QG-21, FR-QG-22). Rules LY-1 to LY-6; config: app/config/lint/layout.config.mjs.
//   node scripts/check-layout.mjs                  check against app/config/gates/baselines/layout-baseline.json
//   node scripts/check-layout.mjs --write-baseline create the baseline (an empty {} counts as none), or lower it; never enlarge it
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import config from "../layout.config.mjs";
import { compareBaseline, toBaseline } from "./layout-baseline.mjs";
import { findLayout } from "./layout-rules.mjs";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(app, "..");
export const BASELINE_FILE = path.join(app, "layout-baseline.json");
const devRef = process.env.LAYOUT_BASE ?? "origin/dev";

const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
// -z keeps paths with spaces or non-ASCII characters unquoted.
const names = (cwd, ...args) =>
  git(cwd, ...args, "-z")
    .split("\0")
    .filter(Boolean);

// Tracked and not-yet-tracked files, without files deleted in the working tree.
export function listPaths(cwd = root) {
  const deleted = new Set(names(cwd, "ls-files", "--deleted"));
  const all = [
    ...names(cwd, "ls-files", "--cached"),
    ...names(cwd, "ls-files", "--others", "--exclude-standard"),
  ];
  return [...new Set(all)].filter((p) => !deleted.has(p));
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  } catch (error) {
    console.error(
      `check-layout: ${BASELINE_FILE} is not valid JSON (${error.message})`,
    );
    return process.exit(1);
  }
}

// The baseline on dev; undefined while dev has none (first PR). In CI a missing ref is an error (LY-6).
function devBaseline() {
  try {
    git(root, "rev-parse", "--verify", "--quiet", devRef);
  } catch {
    if (process.env.CI) {
      console.error(
        `check-layout: ${devRef} is not fetched; CI must fetch it (LY-6)`,
      );
      process.exit(1);
    }
    console.warn(
      `check-layout: ${devRef} not found, skipping the "baseline must not grow" comparison`,
    );
    return undefined;
  }
  try {
    return JSON.parse(git(root, "show", `${devRef}:app/config/gates/baselines/layout-baseline.json`));
  } catch {
    return undefined;
  }
}

function main() {
  const findings = findLayout(listPaths(), config);
  const baseline = readBaseline();
  if (process.argv.includes("--write-baseline")) {
    // An empty baseline counts as "none yet", so the file can exist before the first write.
    const known = baseline && Object.keys(baseline).length > 0;
    const worse = known
      ? compareBaseline(findings, baseline).filter((e) => !e.startsWith("LY-6"))
      : [];
    if (worse.length) {
      console.error(
        `check-layout: refusing to enlarge the baseline:\n${worse.join("\n")}`,
      );
      process.exit(1);
    }
    fs.writeFileSync(
      BASELINE_FILE,
      `${JSON.stringify(toBaseline(findings), null, 2)}\n`,
    );
    console.log(
      `check-layout: wrote ${BASELINE_FILE} (${findings.length} directories)`,
    );
    return;
  }
  const errors = compareBaseline(findings, baseline ?? {}, devBaseline());
  if (errors.length) {
    console.error(
      `check-layout: ${errors.length} problem(s)\n${errors.map((e) => `  ${e}`).join("\n")}`,
    );
    process.exit(1);
  }
  console.log(`check-layout: OK (${findings.length} baselined directories)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 5: Run the test and see it pass**

Run: `cd app && node --test scripts/check-layout.test.mjs`
Expected: PASS, 1 test.

- [ ] **Step 6: Lint and format the new files**

Run: `cd app && npx prettier --write layout.config.mjs scripts/layout-*.mjs scripts/check-layout*.mjs && npx eslint layout.config.mjs scripts/layout-*.mjs scripts/check-layout*.mjs`
Expected: no ESLint output. If `security/detect-unsafe-regex` fires on a pattern, replace the pattern by a simpler one; do not disable the rule.

- [ ] **Step 7: Commit**

```bash
git add app/config/lint/layout.config.mjs app/scripts/check-layout.mjs app/scripts/check-layout.test.mjs
git commit -m "chore(qg): add the layout check CLI and configuration (FR-QG-21, US-QG-09)"
```

### Task 4: Baseline, gate wiring and `make` targets

**Files:**

- Create: `app/config/gates/baselines/layout-baseline.json` (generated)
- Modify: `app/package.json` (the `scripts` block)
- Modify: `Makefile` (`.PHONY` line and two targets)
- Modify: `app/scripts/check-layout.test.mjs` (add the "repo passes" test)

**Interfaces:**

- Consumes: the CLI from Task 3.
- Produces: `npm run layout`, `make layout`, `make layout-baseline`; `layout` is part of `npm run gates`, therefore of `make gates`, pre-push and `make ci`.

- [ ] **Step 1: Create the baseline in two steps** (the baseline file is itself a unit of `app/`, so it must exist before it is measured)

Run:

```bash
cd app && echo '{}' > layout-baseline.json && node scripts/check-layout.mjs --write-baseline && node scripts/check-layout.mjs
```

Expected: `wrote .../layout-baseline.json (<n> directories)` and then `check-layout: OK (<n> baselined directories)` with `<n>` around 98, plus the warning that `origin/dev` has no baseline yet is not shown because the ref exists; the comparison is skipped silently while `dev` has no baseline file.

- [ ] **Step 2: Prove the ratchet by hand** (four scenarios, undo each)

Run:

```bash
cd app
touch scripts/zz-extra.mjs && node scripts/check-layout.mjs; echo "exit $?"      # expect exit 1, "LY-1 app/scripts ... got worse"
node scripts/check-layout.mjs --write-baseline; echo "exit $?"                      # expect exit 1, "refusing to enlarge"
rm scripts/zz-extra.mjs
node scripts/check-layout.mjs; echo "exit $?"                                       # expect exit 0
```

- [ ] **Step 3: Add the "repo passes" test** to `app/scripts/check-layout.test.mjs`

Add these imports at the top and the `describe` block at the end of the file:

```js
import config from "../layout.config.mjs";
import { compareBaseline } from "./layout-baseline.mjs";
import { findLayout } from "./layout-rules.mjs";
import { BASELINE_FILE, listPaths } from "./check-layout.mjs";
```

(the existing import line `import { listPaths } from "./check-layout.mjs";` becomes the last of these)

```js
describe("US-QG-09 the repo", () => {
  it("passes the layout check with its own baseline", () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
    assert.deepEqual(
      compareBaseline(findLayout(listPaths(), config), baseline),
      [],
    );
  });
});
```

Run: `cd app && node --test scripts/check-layout.test.mjs`
Expected: PASS, 2 tests.

- [ ] **Step 4: Wire `package.json`**

In the `scripts` block add the line after `"boundaries"`:

```json
    "layout": "node scripts/check-layout.mjs",
```

and in the `gates` script insert `npm run layout &&` directly after `npm run boundaries &&`.

- [ ] **Step 5: Add the make targets** to `Makefile`

Add `layout layout-baseline` to the `.PHONY` list, and add the two targets next to the other gate targets (for example above `gates:`). Each target needs a `## ` comment, because `make help` and `check-ci-drift` read it. In the real `Makefile` the recipe line starts with a **tab**; the block below shows four spaces only because the markdown lint rejects tabs:

```make
layout: ## File layout: at most 5 units per directory, names, component folders, baseline ratchet (QG-C4, US-QG-09)
    cd $(APP) && npm run layout

layout-baseline: ## Create or lower app/config/gates/baselines/layout-baseline.json, never enlarge it (FR-QG-22)
    cd $(APP) && npm run layout -- --write-baseline
```

- [ ] **Step 6: Run the gates**

Run: `make gates`
Expected: green; the output contains `check-layout: OK (<n> baselined directories)`. Also run `make layout` and `make help | grep layout` (both targets listed).

- [ ] **Step 7: Commit**

```bash
git add app/config/gates/baselines/layout-baseline.json app/package.json Makefile app/scripts/check-layout.test.mjs
git commit -m "chore(qg): run the layout check in the gates with a baseline (FR-QG-21, FR-QG-22)"
```

### Task 5: Principle, agent rule and spec status

**Files:**

- Create: `docs/guides/principles/prin-011-file-layout.md`
- Modify: `docs/guides/principles/readme.md` (table "Entries")
- Modify: `AGENTS.md` (section "While you work")
- Modify: `docs/specs/product/18-architecture-and-quality-gates.md` (status symbols of `US-QG-09`, `FR-QG-21`, `FR-QG-22`)
- Modify: `docs/specs/product/readme.md` (list of 🟨 IDs in the status paragraph)

- [ ] **Step 1: Write the principle** `docs/guides/principles/prin-011-file-layout.md` (format of `PRIN-004`)

```markdown
---
id: PRIN-011
title: The file layout is checked and the baseline only shrinks
maturity: gated
spec: [FR-QG-21, FR-QG-22, US-QG-09]
---

## Why it is better

A directory with few entries and a predictable name can be read at a glance, and a rule that a script checks does not rot. The baseline lets the gate run from day one without blocking work on old disorder.

## How it is measured

`make layout` counts units per directory (files with the same stem count once) and reports violations of LY-1 to LY-5; the target is an empty `app/config/gates/baselines/layout-baseline.json`. Limits: 5 units per directory, 10 feature directories per module (starting values, assumption).

## Checked by

`app/scripts/check-layout.mjs`, `app/scripts/layout-rules.mjs`, `app/scripts/layout-baseline.mjs` and their tests `app/scripts/check-layout.test.mjs`, `app/scripts/layout-rules.test.mjs`, `app/scripts/layout-baseline.test.mjs`; configuration `app/config/lint/layout.config.mjs`.

## Gate

`make layout` (part of `make gates`, repeated in `make ci`), which the CI job `app` in `.github/workflows/ci.yml` runs and `ci-status` requires.

## Evidence

One test per rule and a test that the repo passes with its baseline (US-QG-09). Limits: the module-root rule and the "touch-it" rule of FR-QG-22 are not implemented yet; the baseline starts with about 100 directories and shrinks with the migration (FR-QG-23).
```

- [ ] **Step 2: Add the row** to the table "Entries" in `docs/guides/principles/readme.md`

```markdown
| PRIN-011 | The file layout is checked, the baseline only shrinks | gated |
```

- [ ] **Step 3: Add one bullet** to "While you work" in `AGENTS.md`

```markdown
- The file layout is checked by `make layout` (at most 5 units per directory, kebab-case names, one folder per component, `app/config/lint/layout.config.mjs`). A new violation fails the gate; the baseline `app/config/gates/baselines/layout-baseline.json` only shrinks. Move files with the layout rules in mind instead of adding to a crowded directory (FR-QG-21).
```

- [ ] **Step 4: Update the status symbols** in the spec

In `18-Architecture-and-Quality-Gates.md` change `US-QG-09` from ⬜ to 🟨 (heading) and the status cell of `FR-QG-21` and `FR-QG-22` from ⬜ to 🟨; `FR-QG-23` stays ⬜ until the first move PR. In `docs/specs/product/readme.md` add `US-QG-09`, `FR-QG-21` and `FR-QG-22` to the list of 🟨 IDs in the status paragraph, with a short note in the style of the neighbouring entries: for `US-QG-09` the `layout-fix` tool is missing, for `FR-QG-21` the module-root rule and the target directories, for `FR-QG-22` the touch-it rule.

- [ ] **Step 5: Run the gates**

Run: `make gates`
Expected: green (`check-principles`, `check-specs`, markdownlint, links, Prettier all pass; Prettier may reformat the new table row, then run `cd app && npx prettier --write ../Docs ../AGENTS.md` and re-run).

- [ ] **Step 6: Commit**

```bash
git add Docs AGENTS.md
git commit -m "docs(qg): add PRIN-011, an agent rule and the status for the layout check (FR-QG-21)"
```

### Task 6: Verify, open the PR, hand over

- [ ] **Step 1: Full verification**

Run: `make ci`
Expected: green. Report the result honestly; if a step fails, show the output and stop. (`make ci` starts the test database; if Docker is not available, run `make gates` and `cd app && node --test "scripts/**/*.test.mjs"` and say so in the PR.)

- [ ] **Step 2: Push and open the PR against `dev`**

```bash
git push -u origin chore/qg-21-layout-check
gh pr create --base dev --title "chore(qg): add the file layout check with a baseline (FR-QG-21)" --body-file <body>
```

The body follows `.github/pull_request_template.md`: `Refs #388` (not `Closes`, PR 7 closes the issue), what and why, the Handoff section (done: PR 1; missing: PRs 2 to 7), test evidence (counts from `make ci`), "AI involvement". End it with the attribution lines of the session.

- [ ] **Step 3: Wait for `ci-status`, then tell the owner what to merge**

Do **not** run `make merge`; it refuses because of gate files. Message to the owner: PR number, "ci-status green", and the review focus: (a) `app/config/lint/layout.config.mjs` (limits and whitelist), (b) the size of `app/config/gates/baselines/layout-baseline.json` (about 100 directories, none of them new), (c) `Makefile` and `package.json` (only the two targets and one gate step), (d) `AGENTS.md` (one bullet).

---

## PRs 2 to 7: outline

Each of these gets its own short plan, written after the previous PR is merged, because it works from measured output (the baseline) and from the state of parallel work. The points below are fixed now.

### PR 2: `layout-fix` (done)

`npm run layout-fix -- <dir> [--apply] [--kebab] [--into folder=prefix,prefix]... [--no-auto]` in `app/tools/layout-fix/` (not a gate; the `make` target comes with the next human-merged PR that touches the `Makefile`). It is a dry run unless `--apply` is given.

- **What it does:** plans the moves for one directory (`fix-plan.mjs`), moves with `git mv`, rewrites every import that points at a moved file (`fix-rewrite.mjs`, `fix-resolve.mjs`: relative specifiers without extension, directory and `index` imports, exact names such as stylesheets, the `@/` alias per package, `vi.mock`, dynamic `import()`), and afterwards checks that every rewritten import still resolves to the file it pointed at; otherwise nothing is changed.
- **The moves:** `--kebab` renames PascalCase and snake_case files (LY-3). A component `x.tsx` with its test, story and skeleton goes into a folder `x/` (LY-4, only below the component roots). `--into folder=prefix,prefix` groups the units that start with a prefix into a folder (the person decides by meaning). Unless `--no-auto` is given, the biggest groups of units that share a name prefix are folded into a folder until the directory is within the limit (LY-1), and a folder that is still too big is split again by the next name segment. A prefix that the directory name already carries is skipped (`care/phases/`, not `care/care/`).
- **What it reports instead of guessing:** folders that are still over the limit after the moves (`still over the limit`), and files that mention a moved path as a string (a config, a doc): `check by hand`. Markdown links are not rewritten; the `docs/` PR handles them with `check-links`.
- **What it does not do:** invent groups. Run on the real tree, the automatic grouping helps in few directories (`core/collection` 32 to 25 units, `core/care` 22 to 15, `api/collection` 17 to 16); in most the file names share no prefix. The meaningful split is made per module with `--into`.
- **Proof on real code** (applied in a scratch state, then discarded): `core/collection` moved 11 files and rewrote 44 imports in 18 files; `tsc` was clean and all 738 core tests passed. The same run showed a new folder with 6 units, which is why the over-limit report exists.
- **Tests:** 37, in a temporary git repository and on in-memory path lists: resolution of every import form, rewriting without touching look-alike strings, planning (components, kebab, groups, recursion, collisions) and the end to end apply, including a check that the layout rules accept the result.
- **Merge:** agent (`make merge`); no gate file.

### PR 3: root and `docs/`

- `Docs/` becomes `docs/` with `specs/{product,prototype}`, `adr`, `guides/{principles,runbooks,pitfalls}`, `records/{spikes,test-logs}`, `roadmap.md`, `design-system.md`; `docs/guides/reference/design-system.md` moves into `docs/`; file names become kebab-case (`PRODUCT-SPECS/00-Product-Overview.md` becomes `specs/product/00-product-overview.md`).
- References to fix: `CLAUDE.md`, `AGENTS.md`, `.claude/` (rules, skills, hooks), `.agents/skills/`, `.github/CODEOWNERS`, `.github/pull_request_template.md`, `README.md`, `app/scripts/check-specs.mjs`, `check-links.mjs`, `check-principles.mjs`, `check-traceability.mjs`, the `docs` script in `app/package.json`, `.markdownlint-cli2.jsonc`.
- Note on case: on a case-insensitive file system `Docs` to `docs` needs two renames (`Docs` to `docs-tmp` to `docs`); do it in two commits.
- Merge: **human** (agent instruction files and `CODEOWNERS` change).

### PR 4a: move `app/scripts` into `app/tools`

`app/scripts` is the one crowded directory where new files arrive all the time (9 of the last 25 merged PRs touched it), and after PR 1 any new check script fails the gate. It is moved first, before `layout-fix`, in **one** mechanical PR: a half-moved tree breaks every path at once, and one PR keeps the freeze short.

**Decision that changes ADR 0008: `app/tools/`, not a root `tools/`.** Several scripts import npm packages (`eslint` in `check-baseline`, `playwright` in the conformance probe, and the `vitest` configs import `coverage-config.mjs`). Node resolves bare imports from the importing file upwards, so scripts under a root `tools/` would not find `app/node_modules`. The Node scripts therefore stay inside `app/` as `app/tools/`; the root `tools/` keeps only the shell scripts from the root `scripts/` (PR 4). ADR 0008 and `FR-QG-23` are amended in this PR, and `rootDirs` in `app/config/lint/layout.config.mjs` stays `app`, `docs`, `tools`.

**Target (every directory has at most 5 units; `make layout` proves it):**

```text
app/tools/
  check/
    code/       check-boundaries, layout/, modules/, design-system/, conformance/
    quality/    check-baseline, check-crap, check-duplicates, check-stories, coverage/
    docs/       check-links, check-principles, check-skills, check-specs, check-traceability
    release/    check-changelog, check-ci-drift, check-release-tags, release-config
    supply/     check-audit, check-deps
  workflow/     board, claim/, merge-pr, project-status/, worktree-env
  dev/          commitlint, git-hook-hints, health-summary, repo-stats, smoke
```

Families that become a folder: `layout/` (check-layout, layout-baseline, layout-rules, layout-tree), `modules/` (check-modules, check-modules-contracts, check-modules-graph, check-modules-sql, module-report), `design-system/` (check-design-system, check-design-system-rules), `conformance/` (check-conformance, conformance-probes, conformance-rules), `coverage/` (check-coverage-ratchet, coverage-config), `claim/` (claim, claim-check, claim-preflight, `lib/` with claim-client, claim-lib, claim-steps), `project-status/` (project-status, project-status-lib). A test or `selftest` file moves with its script (same stem).

**Steps, in this order:**

1. **Mapping table first.** One JSON file (kept out of the repo) maps every old path to its new path; a one-off script reads it and does all of steps 2 to 4, so the move is repeatable after a conflict.
2. **`git mv`** for every file, so `git log --follow` and rename detection keep working.
3. **Relative imports and paths inside the scripts**: `../packages/...`, `../eslint.config.js`, `import.meta.url` based roots (for example `check-layout.mjs` derives `app` and `root` two levels up; after the move it is four) and the copy list in `check-layout.test.mjs`, which builds a throwaway repo from the script names and the path `app/scripts/...`.
4. **References outside the scripts**, found with `grep -rIlE "app/scripts|scripts/[a-z-]+\.mjs|node scripts/"` (about 40 files): `Makefile` (17 places), `app/package.json` (20), `.github/workflows/*.yml`, `.githooks/*`, `.claude/hooks/*.mjs` and its tests, `.claude/rules/*`, `.agents/skills/*`, `app/config/lint/knip.json`, `app/config/lint/eslint.config.js` (imports `check-boundaries.mjs`), `app/packages/*/vitest.config.ts` and `vite.config.ts` (import `coverage-config.mjs`), `app/config/lint/modules.config.mjs`, `app/config/gates/quality-limits.json`, `app/config/gates/audit-allowlist.json`, `app/config/deploy/scripts/*.sh`, `README.md`, `docs/guides/reference/design-system.md` and the docs.
5. **Gate-file definitions must follow the move, with tests.** `.claude/hooks/rules.mjs` and `isGateFile` in `merge-pr.mjs` decide which paths a human must approve. If they still name `app/scripts/`, the moved check scripts silently stop being gate files and an agent could merge a change to them. Add a test to `rules.test.mjs` and `merge-pr.test.mjs` for every new group (`app/tools/check/**`, `app/tools/workflow/**`) before changing the patterns, and watch it fail first.
6. **Baseline**: the `app/scripts` entry disappears from `app/config/gates/baselines/layout-baseline.json` (it only shrinks).
7. **Verify:** `make ci`, `make layout`, `grep -rn "app/scripts"` returns nothing but history (`docs/records/test-logs`, changelog), `check-links`, and a manual run of `make claim` (dry run), `make worktree`, `make merge` (refuses a gate-file PR) and `make board`, because the workflow scripts have the most path logic.

**Risks and how they are handled:**

- **Open PRs that touch `app/scripts`** (7 files in #414 today) conflict. Rename detection resolves most; the rest is rebased onto the new paths by the author of that PR. Post a comment on #388 one day ahead and keep the merge window short.
- **Another race with `dev`** (see #418): create the baseline change and the move on a fresh `dev`, run `make ci`, and merge right after the green run.
- **A path nobody greps for** (a path built from parts, such as `` `scripts/${name}` ``): `make ci` plus the manual workflow runs in step 7 are the net; add anything found to the mapping and to a test.
- **`.claude/` edits ask a human** (hook): expected, and the reason the PR is human-merged.

**Merge:** **human** (`Makefile`, workflows, hooks, `.claude/`, check scripts).

### PR 4: `tools/`, `app/config`, `app/gates`

- Move the root `scripts/*.sh` into `tools/` (shell only; the Node scripts moved in PR 4a); move gate data (`quality-limits.json`, `quality-baseline.json`, `quality-ds-baseline.json`, `coverage-thresholds.json`, `audit-allowlist.json`, `layout-baseline.json`) to `app/gates/`; tool configs (`eslint.config.js`, `knip.json`, `commitlint.config.js`, `release.config.js`, `.prettierrc.json`, `tsconfig.base.json`) to `app/config/` where the tool accepts `--config`; otherwise they stay in `app/` and are named in the whitelist of `layout.config.mjs`.
- Adapt: `Makefile`, `app/package.json`, all workflows, `.githooks/`, `check-ci-drift.mjs`, `.github/CODEOWNERS` (`/scripts/` becomes `/tools/`), and the path inside `check-layout.mjs` (`devBaseline` reads `app/config/gates/baselines/layout-baseline.json` from `dev`; during the move PR it must read the old path).
- Merge: **human** (Makefile, workflows, hooks, thresholds).

### PR 5: `core` and `api`

- One PR per module, in the order of the baseline size: `collection`, `care`, `account`, `catalog`, `light`, `pokedex`, `wishlist`, `kernel`. Each PR runs `make layout-fix PATH=app/packages/<pkg>/src/<module>` for `core` and `api` together, lowers `app/gates/layout-baseline.json` in the same PR and keeps `make ci` green.
- Check `make board` for open claims in the module before starting; wait if there is one.
- Merge: agent.

### PR 6: `web`

- Start only after the open DS-48 pull requests are merged. Order: `web/src/app/` and `web/src/shared/` (move `App.tsx`, `routes.tsx`, `navigation.tsx`, `start-page.tsx`, `onboarding-wizard.tsx`, `kernel`, `components`, `lib`, `platform`, `styles`), then each `components/ui` component into its own folder (40 files), then one PR per module.
- The `design-system` baseline and `check-design-system-rules.mjs` refer to paths such as `components/ui`; update them in the same PR (they are gate files, so those PRs need a human merge; split the path change into its own PR if needed).
- Merge: agent where no gate file changes, otherwise human.

### PR 7: touch-it rule and ceilings

- Add the touch-it rule to `check-layout.mjs` (a PR that touches a file in a baselined directory must leave that directory compliant or move the file) with tests.
- Put the ceiling per release into `.agents/skills/release-checklist` (starting values come from the baseline size at that time; assumption, no number in advance) and a line in `repo-stats.sh` output.
- Close #388 (`Closes #388`), set `FR-QG-23` to ✅ when the baseline is empty.
- Merge: **human**.

### Rules while the migration runs

- Every move PR lowers the baseline in the same PR; the gate enforces it.
- Moves use `git mv`, never delete-and-add, so `git log --follow` keeps working.
- A move PR is small (one module or one folder); conflicts with open PRs are solved by the later PR.
- Spec status and counters change in the same PR as the code (`AGENTS.md`).
