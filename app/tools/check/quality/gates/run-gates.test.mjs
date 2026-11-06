import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatBlock, runArgv, runGateSteps, runGates, summarize } from "./run-gates.mjs";
import { ESLINT_SHARED, GATE_PARALLEL_LIMIT, GATE_STEPS } from "./gate-steps.mjs";
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
  it("prints every step and the summary, and returns exit code 1 when a step failed", async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "gates-run-"));
    try {
      const written = [];
      const code = await runGates({
        steps: [step("a"), step("b")],
        runOne: async (s) => ({ ...ok(s.name), ok: s.name !== "b" }),
        write: (text) => written.push(text),
        cacheDir,
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

  it("gives every step the same shared results file and removes it afterwards", async () => {
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
