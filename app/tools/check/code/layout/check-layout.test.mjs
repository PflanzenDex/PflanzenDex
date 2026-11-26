import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "../../../../config/lint/layout.config.mjs";
import { compareBaseline } from "./layout-baseline.mjs";
import { judgeLayout } from "./layout-rules.mjs";
import { BASELINE_FILE, listPaths, readWorkingText } from "./check-layout.mjs";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "ignore" });

describe("US-QG-09 listPaths", () => {
  it("lists tracked and new files unquoted and skips files deleted in the working tree", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layout-"));
    try {
      git(dir, "init", "-q");
      for (const f of ["größe.md", "a b.md", "gone.md"]) fs.writeFileSync(path.join(dir, f), "");
      git(dir, "add", "-A");
      git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "x");
      fs.rmSync(path.join(dir, "gone.md"));
      fs.writeFileSync(path.join(dir, "new.md"), "");
      assert.deepEqual(listPaths(dir).sort(), ["a b.md", "größe.md", "new.md"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("US-QG-09 the repo", () => {
  it("passes the layout check with its own baseline", () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
    const { findings } = judgeLayout(listPaths(), config, readWorkingText);
    assert.deepEqual(compareBaseline(findings, baseline), []);
  });
});

describe("US-QG-09 routine additions", () => {
  const baseline = () => JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  const problems = (extra) =>
    compareBaseline(
      judgeLayout([...listPaths(), ...extra], config, readWorkingText).findings,
      baseline(),
    );
  const shots = (dir) => Array.from({ length: 7 }, (_, i) => `${dir}/0${i + 1}-shot.png`);
  it("accepts a new ADR without touching the baseline", () => {
    assert.deepEqual(problems(["docs/adr/0099-new-decision.md"]), []);
  });
  it("accepts a new test log with many screenshots and one more screenshot in an old log", () => {
    assert.deepEqual(
      problems(["docs/records/test-logs/soz-01.md", ...shots("docs/records/test-logs/soz-01")]),
      [],
    );
    assert.deepEqual(problems(["docs/records/test-logs/bes-01/99-extra.png"]), []);
  });
  it("accepts a new principle and a new spec file", () => {
    assert.deepEqual(problems(["docs/guides/principles/prin-099-new-rule.md"]), []);
    assert.deepEqual(problems(["docs/specs/product/99-new-epic.md"]), []);
  });
});

// The CLI is run as a child process inside a throwaway git repository that holds a copy of the
// scripts, so the ratchet protections are tested end to end without touching this repository.
describe("US-QG-09 CLI protections of the ratchet", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const copies = [
    ["../../../../config/lint/layout.config.mjs", "app/config/lint/layout.config.mjs"],
    // The entry-point helper the scripts import from the shared folder (US-QG-02).
    ["../../shared/entry-point.mjs", "app/tools/check/shared/entry-point.mjs"],
    ...["check-layout", "layout-rules", "layout-tree", "layout-baseline", "layout-manifest"].map(
      (n) => [`${n}.mjs`, `app/tools/check/code/layout/${n}.mjs`],
    ),
  ];
  const gitIn = (dir, ...args) =>
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
      cwd: dir,
      stdio: "ignore",
    });

  // Units with three extensions in turn, so no automatic collection applies (d-133) and each unit counts (FR-QG-21).
  // FAILING units are above the failing limit of a folder without a manifest (16, twice the size hint, d-138).
  const FAILING = 17;
  const EXTS = ["md", "json", "css"];
  const writeUnits = (root, dir, n) => {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    for (let i = 0; i < n; i++) fs.writeFileSync(path.join(root, dir, `f${i}.${EXTS[i % 3]}`), "");
  };

  // A repo whose directory app/x has `units` units, so it violates LY-1 when units > 16 (no manifest, d-138).
  function repo(units) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layout-cli-"));
    for (const [from, to] of copies) {
      fs.mkdirSync(path.dirname(path.join(dir, to)), { recursive: true });
      fs.copyFileSync(path.join(here, from), path.join(dir, to));
    }
    fs.mkdirSync(path.join(dir, "app/config/gates/baselines"), { recursive: true });
    fs.writeFileSync(path.join(dir, "README.md"), "");
    writeUnits(dir, "app/x", units);
    gitIn(dir, "init", "-q");
    gitIn(dir, "add", "-A");
    gitIn(dir, "commit", "-qm", "init");
    const run = (args = [], env = {}) => {
      const clean = { ...process.env, CI: "", LAYOUT_BASE: "", ...env };
      return spawnSync("node", ["app/tools/check/code/layout/check-layout.mjs", ...args], {
        cwd: dir,
        env: clean,
        encoding: "utf8",
      });
    };
    const baselineFile = path.join(dir, "app/config/gates/baselines/layout-baseline.json");
    return {
      dir,
      run,
      baselineFile,
      remove: () => fs.rmSync(dir, { recursive: true, force: true }),
    };
  }

  it("a folder of 9 units passes with a hint on stdout, and no failure (US-QG-09, d-136)", () => {
    const r = repo(9);
    try {
      const out = r.run();
      assert.equal(out.status, 0, out.stderr);
      assert.match(out.stdout, /check-layout: hint app\/x: 9 units, size hint 8/);
      assert.doesNotMatch(out.stderr, /LY-1/);
    } finally {
      r.remove();
    }
  });

  it("a folder of 17 units without a manifest fails with LY-1 on the CLI", () => {
    const r = repo(FAILING);
    try {
      const out = r.run();
      assert.equal(out.status, 1);
      assert.match(out.stderr, /LY-1 app\/x: 17/);
    } finally {
      r.remove();
    }
  });

  it("a damaged baseline gives a readable error, not a stack trace", () => {
    const r = repo(FAILING);
    try {
      fs.writeFileSync(r.baselineFile, "{not json");
      const out = r.run();
      assert.equal(out.status, 1);
      assert.match(out.stderr, /is not valid JSON/);
      assert.doesNotMatch(out.stderr, /\n\s+at /);
    } finally {
      r.remove();
    }
  });

  it("an empty {} baseline can be written once, then the check passes", () => {
    const r = repo(FAILING);
    try {
      fs.writeFileSync(r.baselineFile, "{}\n");
      assert.equal(r.run(["--write-baseline"]).status, 0);
      assert.deepEqual(JSON.parse(fs.readFileSync(r.baselineFile, "utf8")), {
        "LY-1": { "app/x": FAILING },
      });
      assert.equal(r.run().status, 0);
    } finally {
      r.remove();
    }
  });

  it("--write-baseline refuses to enlarge the baseline and leaves the file alone", () => {
    const r = repo(FAILING);
    try {
      fs.writeFileSync(r.baselineFile, "{}\n");
      r.run(["--write-baseline"]);
      const before = fs.readFileSync(r.baselineFile, "utf8");
      fs.writeFileSync(path.join(r.dir, `app/x/f${FAILING}.md`), "");
      const out = r.run(["--write-baseline"]);
      assert.equal(out.status, 1);
      assert.match(out.stderr, /refusing to enlarge/);
      assert.equal(fs.readFileSync(r.baselineFile, "utf8"), before);
    } finally {
      r.remove();
    }
  });

  it("in CI a missing base ref fails instead of skipping the comparison", () => {
    const r = repo(FAILING);
    try {
      fs.writeFileSync(r.baselineFile, "{}\n");
      r.run(["--write-baseline"]);
      const out = r.run([], { CI: "true" });
      assert.equal(out.status, 1);
      assert.match(out.stderr, /is not fetched/);
    } finally {
      r.remove();
    }
  });

  it("an entry that the base ref does not have fails the check", () => {
    const r = repo(FAILING);
    try {
      fs.writeFileSync(r.baselineFile, `${JSON.stringify({ "LY-1": { "app/x": FAILING } })}\n`);
      gitIn(r.dir, "add", "-A");
      gitIn(r.dir, "commit", "-qm", "baseline");
      gitIn(r.dir, "branch", "base");
      writeUnits(r.dir, "app/y", FAILING);
      fs.writeFileSync(
        r.baselineFile,
        `${JSON.stringify({ "LY-1": { "app/x": FAILING, "app/y": FAILING } })}\n`,
      );
      const out = r.run([], { LAYOUT_BASE: "base" });
      assert.equal(out.status, 1);
      assert.match(out.stderr, /LY-6 LY-1 app\/y: entry is not on dev/);
    } finally {
      r.remove();
    }
  });
});

describe("US-QG-09 module roots (FR-QG-21)", () => {
  const baseline = () => JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  const problems = (extra) =>
    compareBaseline(
      judgeLayout([...listPaths(), ...extra], config, readWorkingText).findings,
      baseline(),
    );
  const units = (dir, n) => Array.from({ length: n }, (_, i) => `${dir}/new-unit-${i}.ts`);
  it("a module may hold up to 10 units, the 11th is a new violation", () => {
    // The module already holds some units; find how many new ones it takes to cross the limit instead of
    // assuming a count that a refactor of the module would invalidate.
    const dir = "app/packages/core/src/pokedex";
    const crossing = Array.from({ length: 11 }, (_, n) => n).find(
      (n) => problems(units(dir, n)).length > 0,
    );
    assert.ok(
      crossing !== undefined && crossing >= 1,
      "the 11th unit must be what crosses the limit",
    );
    assert.deepEqual(problems(units(dir, crossing - 1)), []);
    assert.match(problems(units(dir, crossing))[0] ?? "", /LY-1 .*pokedex/);
  });
  it("the src folder that holds the modules has no unit limit", () => {
    assert.deepEqual(problems(units("app/packages/core/src", 20)), []);
  });
});
