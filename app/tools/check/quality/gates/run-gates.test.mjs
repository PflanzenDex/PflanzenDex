import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { formatBlock, runArgv, runGates, summarize } from "./run-gates.mjs";
import { ESLINT_SHARED, GATE_PARALLEL_LIMIT, GATE_STEPS, runGateSteps } from "./gate-steps.mjs";
import { RESULTS_ENV } from "./eslint-shared.mjs";

const pause = () => new Promise((resolve) => setTimeout(resolve, 5));
const step = (name, extra = {}) => ({ name, argv: ["unused"], ...extra });
const ok = (name) => ({ name, ok: true, output: `${name} output\n`, seconds: 0 });
const CHAIN = [
  "lint",
  "typecheck",
  "layout",
  "boundaries",
  "db-indexes",
  "migration-numbers",
  "baseline",
  "design-system",
  "ui-text",
  "constants",
  "stories",
  "knip",
  "specs",
  "spec-numbers",
  "dod-numbers",
  "principles",
  "skills",
  "reference",
  "duplicates",
  "dup",
  "format:check",
  "ci-drift",
  "docs",
];

describe("US-QG-01 gate step table", () => {
  it("every script of the former gates chain is a step, plus the shared ESLint pass", () => {
    const names = GATE_STEPS.map((s) => s.name);
    assert.equal(new Set(names).size, names.length);
    assert.deepEqual([...names].sort(), [...CHAIN, ESLINT_SHARED].sort());
  });

  it("each npm step runs its script, and the baseline, ui-text and constants checks wait for the shared pass", () => {
    for (const s of GATE_STEPS.filter((x) => x.name !== ESLINT_SHARED))
      assert.deepEqual(s.argv, ["npm", "run", s.name]);
    for (const name of ["baseline", "ui-text", "constants"])
      assert.deepEqual(GATE_STEPS.find((s) => s.name === name).needs, [ESLINT_SHARED]);
  });

  it("starts the heavy steps first: typecheck, lint, the shared pass and format-check", () => {
    assert.deepEqual(
      GATE_STEPS.slice(0, 4)
        .map((s) => s.name)
        .sort(),
      ["eslint-shared", "format:check", "lint", "typecheck"],
    );
  });

  it("runs at most four steps at a time", () => {
    assert.equal(GATE_PARALLEL_LIMIT, 4);
  });
});

describe("US-QG-01 runGateSteps", () => {
  it("runs at most the limit of steps at once, and reaches it", async () => {
    let inFlight = 0;
    let peak = 0;
    const runStep = async (s) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await pause();
      inFlight -= 1;
      return ok(s.name);
    };
    const steps = Array.from({ length: 10 }, (_, i) => step(`s${i}`));
    const results = await runGateSteps(steps, { runStep });
    assert.equal(peak, GATE_PARALLEL_LIMIT);
    assert.equal(results.length, 10);

    peak = 0;
    await runGateSteps(steps, { runStep, limit: 2 });
    assert.equal(peak, 2);
  });

  it("a failed step does not stop the others, and it is reported as failed", async () => {
    const steps = [step("a"), step("b"), step("c")];
    const results = await runGateSteps(steps, {
      runStep: async (s) => ({ ...ok(s.name), ok: s.name !== "b" }),
    });
    assert.deepEqual(results.map((r) => r.name).sort(), ["a", "b", "c"]);
    assert.deepEqual(
      results.filter((r) => !r.ok).map((r) => r.name),
      ["b"],
    );
  });

  it("a step that throws counts as a failed step and the others still run", async () => {
    const results = await runGateSteps([step("a"), step("b")], {
      runStep: async (s) => {
        if (s.name === "a") throw new Error("spawn failed");
        return ok(s.name);
      },
    });
    assert.equal(results.length, 2);
    const failed = results.find((r) => !r.ok);
    assert.equal(failed.name, "a");
    assert.match(failed.output, /spawn failed/);
  });

  it("starts a step only after the steps it needs have finished", async () => {
    const log = [];
    await runGateSteps([step("dependent", { needs: ["base"] }), step("base")], {
      runStep: async (s) => {
        log.push(`start ${s.name}`);
        await pause();
        log.push(`end ${s.name}`);
        return ok(s.name);
      },
    });
    assert.deepEqual(log, ["start base", "end base", "start dependent", "end dependent"]);
  });

  it("a failed step still lets its dependent step run", async () => {
    const results = await runGateSteps([step("base"), step("dependent", { needs: ["base"] })], {
      runStep: async (s) => ({ ...ok(s.name), ok: s.name !== "base" }),
    });
    assert.deepEqual(
      results.map((r) => [r.name, r.ok]),
      [
        ["base", false],
        ["dependent", true],
      ],
    );
  });

  it("starts the heavy steps first, when the limit is reached", async () => {
    const started = [];
    await runGateSteps(GATE_STEPS, {
      runStep: async (s) => {
        started.push(s.name);
        await pause();
        return ok(s.name);
      },
    });
    assert.deepEqual(started.slice(0, 4).sort(), [
      "eslint-shared",
      "format:check",
      "lint",
      "typecheck",
    ]);
  });

  it("refuses a step that needs an unknown step, and duplicate step names", () => {
    const runStep = async (s) => ok(s.name);
    assert.throws(
      () => runGateSteps([step("a", { needs: ["zz"] })], { runStep }),
      /needs unknown step zz/,
    );
    assert.throws(() => runGateSteps([step("a"), step("a")], { runStep }), /must be unique/);
  });

  it("refuses a dependency cycle instead of waiting forever", async () => {
    await assert.rejects(
      runGateSteps([step("a", { needs: ["b"] }), step("b", { needs: ["a"] })], {
        runStep: async (s) => ok(s.name),
      }),
      /cannot start: a, b/,
    );
  });
});

describe("US-QG-01 runner output", () => {
  it("formatBlock prints the header and the whole output as one string", () => {
    assert.equal(
      formatBlock({ name: "lint", ok: false, output: "first\nsecond", seconds: 2 }),
      "--- lint: FAILED in 2.0 s\nfirst\nsecond\n",
    );
  });

  it("summarize names every failed step with the command that re-runs it", () => {
    const text = summarize(
      [
        { name: "lint", ok: true },
        { name: "baseline", ok: false },
        { name: ESLINT_SHARED, ok: false },
      ],
      3,
    );
    assert.match(text, /^gates: 3 steps in 3\.0 s, at most 4 at a time, 2 failed/);
    assert.match(text, /FAILED baseline: re-run: npm run baseline/);
    assert.match(text, /FAILED eslint-shared: re-run: npm run gates/);
  });

  it("runArgv returns the output and the exit status of a real process", async () => {
    const pass = await runArgv(
      step("pass", { argv: [process.execPath, "-e", "process.stdout.write('\\u00e4\\n')"] }),
    );
    assert.deepEqual([pass.name, pass.ok, pass.output], ["pass", true, "ä\n"]);

    const fail = await runArgv(
      step("fail", {
        argv: [
          process.execPath,
          "-e",
          "process.stdout.write('out\\n'); process.stderr.write('err\\n'); process.exit(3)",
        ],
      }),
    );
    assert.equal(fail.ok, false);
    assert.equal(fail.output, "out\nerr\n");
  });
});

describe("US-QG-01 runGates", () => {
  it("prints every step and the summary, and returns exit code 1 when a step failed", async (t) => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "gates-run-"));
    try {
      const written = [];
      const code = await runGates({
        steps: [step("a"), step("b")],
        runOne: async (s) => ({ ...ok(s.name), ok: s.name !== "b" }),
        write: (text) => written.push(text),
        cacheDir,
        appDir: greenRepo(t).appDir,
        gateEnv: {},
      });
      const text = written.join("");
      assert.equal(code, 1);
      assert.match(text, /--- a: ok/);
      assert.match(text, /--- b: FAILED/);
      assert.match(text, /FAILED b: re-run: npm run b/);
      assert.deepEqual(fs.readdirSync(cacheDir), []);
    } finally {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it("gives every step the same shared results file and removes it afterwards", async (t) => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "gates-run-"));
    try {
      const files = [];
      const code = await runGates({
        steps: [step("a"), step("b")],
        runOne: async (s, env) => {
          files.push(env[RESULTS_ENV]);
          return ok(s.name);
        },
        write: () => {},
        cacheDir,
        appDir: greenRepo(t).appDir,
        gateEnv: {},
      });
      assert.equal(code, 0);
      assert.equal(files.length, 2);
      assert.equal(files[0], files[1]);
      assert.equal(path.dirname(files[0]), cacheDir);
      assert.equal(fs.existsSync(files[0]), false);
    } finally {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});

// US-QG-01 (issue 1608): the green result. Real git in a temporary repository: dev is origin/dev, the app folder has a
// tracked and a deleted file, and a lock stamp in node_modules, which the ignore rules leave out of the tree. The record
// lives in the git directory. Everything is removed when the test ends. Git variables of an outer hook are dropped.
const GIT_FREE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);
function gitIn(cwd, args) {
  const out = spawnSync(
    "git",
    [
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    {
      cwd,
      env: GIT_FREE_ENV,
      encoding: "utf8",
    },
  );
  assert.equal(out.status, 0, `git ${args.join(" ")}: ${out.stderr}`);
  return out.stdout.trim();
}

function greenRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gates-green-"));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "gates-cache-"));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  });
  gitIn(dir, ["init", "-q", "-b", "dev"]);
  const appDir = path.join(dir, "app");
  fs.mkdirSync(path.join(appDir, "node_modules"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");
  fs.writeFileSync(path.join(appDir, "node_modules", ".setup-lock-hash"), "lock-1\n");
  fs.writeFileSync(path.join(appDir, "tracked.txt"), "tracked\n");
  fs.writeFileSync(path.join(appDir, "gone.txt"), "gone\n");
  gitIn(dir, ["add", "-A"]);
  gitIn(dir, ["commit", "-q", "-m", "init"]);
  gitIn(dir, ["update-ref", "refs/remotes/origin/dev", "HEAD"]);
  const gitDir = gitIn(dir, ["rev-parse", "--absolute-git-dir"]);
  return {
    dir,
    appDir,
    gitDir,
    record: path.join(gitDir, "gates-green.json"),
    cacheDir: path.join(scratch, "cache"),
  };
}

// One run with fake steps `a` and `b`; `failing` names the steps that fail, `edit` runs during step a.
async function greenRun(repo, { gateEnv = {}, failing = [], edit } = {}) {
  const ran = [];
  const written = [];
  const code = await runGates({
    steps: [step("a"), step("b")],
    runOne: async (s) => {
      ran.push(s.name);
      if (edit && s.name === "a") edit();
      return { ...ok(s.name), ok: !failing.includes(s.name) };
    },
    write: (text) => written.push(text),
    cacheDir: repo.cacheDir,
    appDir: repo.appDir,
    gateEnv,
  });
  return { code, ran, out: written.join("") };
}

describe("US-QG-01 green result", () => {
  it("US-QG-01: a passed run records its content, and the same content skips the steps", async (t) => {
    const repo = greenRepo(t);
    assert.deepEqual((await greenRun(repo)).ran, ["a", "b"]);
    assert.equal(fs.existsSync(repo.record), true);
    const again = await greenRun(repo);
    assert.equal(again.code, 0);
    assert.deepEqual(again.ran, []);
    assert.match(
      again.out,
      /^gates: skipped, this exact content passed at \d{4}-\d{2}-\d{2}T[^ ]+ \(FRESH=1 runs them\)\n$/,
    );
  });

  it("US-QG-01: a changed tracked file, a new untracked file, a deleted file, a moved origin/dev and a changed lock stamp each run the steps", async (t) => {
    const repo = greenRepo(t);
    await greenRun(repo);
    const changes = [
      [
        "a changed tracked file",
        () => fs.appendFileSync(path.join(repo.appDir, "tracked.txt"), "more\n"),
      ],
      ["a new untracked file", () => fs.writeFileSync(path.join(repo.appDir, "new.txt"), "new\n")],
      ["a deleted file", () => fs.rmSync(path.join(repo.appDir, "gone.txt"))],
      [
        "a moved origin/dev",
        () => {
          gitIn(repo.dir, ["commit", "-q", "--allow-empty", "-m", "next"]);
          gitIn(repo.dir, ["update-ref", "refs/remotes/origin/dev", "HEAD"]);
        },
      ],
      [
        "a changed lock stamp",
        () =>
          fs.writeFileSync(path.join(repo.appDir, "node_modules", ".setup-lock-hash"), "lock-2\n"),
      ],
    ];
    for (const [name, change] of changes) {
      change();
      const run = await greenRun(repo);
      assert.deepEqual(run.ran, ["a", "b"], name);
      assert.equal(run.code, 0, name);
      assert.equal(fs.existsSync(repo.record), true, name);
    }
    assert.deepEqual((await greenRun(repo)).ran, [], "unchanged after the last change");
  });

  it("US-QG-01: a different DUPLICATES_BASE is another content and runs the steps", async (t) => {
    const repo = greenRepo(t);
    await greenRun(repo);
    assert.deepEqual((await greenRun(repo, { gateEnv: { DUPLICATES_BASE: "origin/main" } })).ran, [
      "a",
      "b",
    ]);
  });

  it("US-QG-01: FRESH=1 runs the steps even for a passed content, and records the pass again", async (t) => {
    const repo = greenRepo(t);
    await greenRun(repo);
    const fresh = await greenRun(repo, { gateEnv: { FRESH: "1" } });
    assert.equal(fresh.code, 0);
    assert.deepEqual(fresh.ran, ["a", "b"]);
    assert.equal(fs.existsSync(repo.record), true);
    assert.deepEqual((await greenRun(repo)).ran, []);
  });

  it("US-QG-01: CI reads and writes no record: the steps run, an existing record is neither used nor replaced, none is created", async (t) => {
    const repo = greenRepo(t);
    const ci = { CI: "true" };
    assert.deepEqual((await greenRun(repo, { gateEnv: ci })).ran, ["a", "b"]);
    assert.equal(fs.existsSync(repo.record), false);
    await greenRun(repo);
    const before = fs.readFileSync(repo.record, "utf8");
    assert.deepEqual((await greenRun(repo, { gateEnv: ci })).ran, ["a", "b"]);
    assert.equal(fs.readFileSync(repo.record, "utf8"), before);
    const failed = await greenRun(repo, { gateEnv: ci, failing: ["b"] });
    assert.equal(failed.code, 1);
    assert.equal(fs.readFileSync(repo.record, "utf8"), before);
  });

  it("US-QG-01: an edit during the run writes no record, and the next run records the edited content", async (t) => {
    const repo = greenRepo(t);
    const edited = await greenRun(repo, {
      edit: () => fs.appendFileSync(path.join(repo.appDir, "tracked.txt"), "edit\n"),
    });
    assert.equal(edited.code, 0);
    assert.equal(fs.existsSync(repo.record), false);
    assert.deepEqual((await greenRun(repo)).ran, ["a", "b"]);
    assert.equal(fs.existsSync(repo.record), true);
  });

  it("US-QG-01: a failed run removes the record", async (t) => {
    const repo = greenRepo(t);
    await greenRun(repo);
    const failed = await greenRun(repo, { gateEnv: { FRESH: "1" }, failing: ["b"] });
    assert.equal(failed.code, 1);
    assert.equal(fs.existsSync(repo.record), false);
    assert.deepEqual((await greenRun(repo)).ran, ["a", "b"]);
  });

  it("US-QG-01: computing the key leaves the real index unchanged and writes no temporary index", async (t) => {
    const repo = greenRepo(t);
    const index = path.join(repo.gitDir, "index");
    fs.writeFileSync(path.join(repo.appDir, "new.txt"), "new\n");
    fs.appendFileSync(path.join(repo.appDir, "tracked.txt"), "unstaged\n");
    const indexBefore = fs.readFileSync(index);
    const stagedBefore = gitIn(repo.dir, ["diff", "--cached", "--name-only"]);
    await greenRun(repo);
    assert.deepEqual(fs.readFileSync(index), indexBefore);
    assert.equal(gitIn(repo.dir, ["diff", "--cached", "--name-only"]), stagedBefore);
    assert.deepEqual(
      fs.readdirSync(repo.gitDir).filter((name) => name.startsWith("gates-index-")),
      [],
    );
  });

  it("US-QG-01: an error while the key is computed runs the steps and never fails the run", async (t) => {
    const repo = greenRepo(t);
    fs.rmSync(path.join(repo.appDir, "node_modules"), { recursive: true });
    const run = await greenRun(repo);
    assert.deepEqual(run.ran, ["a", "b"]);
    assert.equal(run.code, 0);
    assert.match(run.out, /gates: the green result is not used \(ENOENT/);
    assert.equal((await greenRun(repo, { failing: ["a"] })).code, 1);
  });

  it("US-QG-01: a folder outside any repository runs the steps and says why no record is used", async (t) => {
    const repo = greenRepo(t);
    const loose = fs.mkdtempSync(path.join(os.tmpdir(), "gates-loose-"));
    t.after(() => fs.rmSync(loose, { recursive: true, force: true }));
    const run = await greenRun({ ...repo, appDir: loose });
    assert.deepEqual(run.ran, ["a", "b"]);
    assert.equal(run.code, 0);
    assert.match(run.out, /gates: the green result is not used \(/);
  });

  it("US-QG-01: a record that cannot be read runs the steps, and the pass replaces it", async (t) => {
    const repo = greenRepo(t);
    fs.writeFileSync(repo.record, "{ not json");
    const run = await greenRun(repo);
    assert.deepEqual(run.ran, ["a", "b"]);
    assert.match(run.out, /gates: the green result is not used \(/);
    assert.equal(JSON.parse(fs.readFileSync(repo.record, "utf8")).key.length, 64);
    assert.deepEqual((await greenRun(repo)).ran, []);
  });
});
