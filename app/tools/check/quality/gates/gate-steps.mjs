// The steps of `npm run gates` (US-QG-01): the 23 scripts of the former `&&` chain, in that order, plus the one ESLint
// pass that baseline, constants and ui-text read (eslint-shared.mjs). `make gates` runs secrets, workflows and
// check-deps itself, before this table. The table order is the start order: heavy steps come first. runGateSteps, the
// scheduler that starts these steps, lives here too (issue 1608), so that run-gates.mjs stays within its line limit.

export const GATE_PARALLEL_LIMIT = 4;
export const ESLINT_SHARED = "eslint-shared";

const npmStep = (name, extra = {}) => ({ name, argv: ["npm", "run", name], ...extra });
const needsSharedPass = { needs: [ESLINT_SHARED] };

export const GATE_STEPS = [
  npmStep("typecheck"),
  npmStep("lint"),
  {
    name: ESLINT_SHARED,
    argv: [process.execPath, "tools/check/quality/gates/eslint-shared-run.mjs"],
  },
  npmStep("format:check"),
  npmStep("layout"),
  npmStep("boundaries"),
  npmStep("db-indexes"),
  npmStep("migration-numbers"),
  npmStep("baseline", needsSharedPass),
  npmStep("design-system"),
  npmStep("ui-text", needsSharedPass),
  npmStep("constants", needsSharedPass),
  npmStep("stories"),
  npmStep("knip"),
  npmStep("specs"),
  npmStep("spec-numbers"),
  npmStep("dod-numbers"),
  npmStep("principles"),
  npmStep("skills"),
  npmStep("reference"),
  npmStep("duplicates"),
  npmStep("dup"),
  npmStep("ci-drift"),
  npmStep("docs"),
];

const isReady = (finished) => (step) => (step.needs ?? []).every((name) => finished.has(name));

function validateSteps(steps, limit) {
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError(`the parallel limit must be a whole number from 1, got ${limit}`);
  const names = new Set(steps.map((step) => step.name));
  if (names.size !== steps.length) throw new Error("gate step names must be unique");
  for (const step of steps)
    for (const need of step.needs ?? [])
      if (!names.has(need)) throw new Error(`gate step ${step.name} needs unknown step ${need}`);
}

// Starts each step once a slot is free and every step in its `needs` has finished. A failed step counts as finished:
// its dependents still run and report what they miss. The table order decides which ready step starts first.
// `runStep` resolves to { name, ok, output, seconds }; a rejected run counts as a failed step.
export function runGateSteps(steps, { limit = GATE_PARALLEL_LIMIT, runStep, onDone = () => {} }) {
  validateSteps(steps, limit);
  return new Promise((resolve, reject) => {
    const waiting = [...steps];
    const finished = new Set();
    const results = [];
    let running = 0;
    const settle = (result) => {
      running -= 1;
      finished.add(result.name);
      results.push(result);
      onDone(result);
      launch();
    };
    const launch = () => {
      let index = waiting.findIndex(isReady(finished));
      while (running < limit && index >= 0) {
        const [step] = waiting.splice(index, 1);
        running += 1;
        Promise.resolve()
          .then(() => runStep(step))
          .catch((error) => ({ name: step.name, ok: false, output: `${error}\n`, seconds: 0 }))
          .then(settle);
        index = waiting.findIndex(isReady(finished));
      }
      if (running > 0) return;
      if (waiting.length > 0)
        reject(new Error(`gate steps cannot start: ${waiting.map((s) => s.name).join(", ")}`));
      else resolve(results);
    };
    launch();
  });
}

// The parts of `make ci` (US-QG-02, issue 1636): the local run of everything CI runs, one part at a time, every part also
// after a failure. CI runs the same commands as separate jobs (`make ci-gates`, `ci-tests-base`, `ci-tests-web`,
// `ci-coverage`, `ci-ui`); the parts split them where a failure should name its part. A part is an npm script of
// app/package.json or a `make` target of the repository root (`-C ..`). `needs` names the parts whose output a part reads:
// the coverage ratchet reads both test parts, the bundle budget and the conformance run read the build. A failed part still
// lets its dependents run. `localOnly` parts run outside CI only (CI has its own database service, see ci.yml).
export const CI_PARALLEL_LIMIT = 1;
const ROOT_MAKE = ["make", "--no-print-directory", "-C", ".."];
const ciNpm = (name, script, extra = {}) => ({
  name,
  argv: ["npm", "run", script],
  rerun: `cd app && npm run ${script}`,
  ...extra,
});
const ciMake = (name, target, extra = {}) => ({
  name,
  argv: [...ROOT_MAKE, target],
  rerun: `make ${target}`,
  ...extra,
});

export const CI_PARTS = [
  ciMake("secrets", "secrets"),
  ciMake("workflows", "workflows"),
  ciMake("database", "db-up", { localOnly: true }),
  ciNpm("gates", "ci:gates"),
  ciNpm("tests-workspaces", "ci:tests:workspaces", { needs: ["database"] }),
  ciNpm("tests-tools", "ci:tests:tools"),
  ciNpm("tests-web", "ci:tests:web"),
  ciNpm("coverage", "ci:coverage", { needs: ["tests-workspaces", "tests-web"] }),
  ciNpm("build", "build"),
  ciNpm("bundle-budget", "bundle-budget", { needs: ["build"] }),
  ciNpm("conformance", "conformance:blocking", { needs: ["build"] }),
];

// The parts that run here: the local-only parts only outside CI, and a `needs` on a part that is left out is dropped with it.
export function ciPartsFor(env = process.env) {
  const parts = CI_PARTS.filter((part) => !(part.localOnly && env.CI));
  const names = new Set(parts.map((part) => part.name));
  return parts.map((part) => ({
    ...part,
    needs: (part.needs ?? []).filter((need) => names.has(need)),
  }));
}

// Runs the parts of `make ci` one at a time with the scheduler of the gates. `runOne(step)` runs one part and resolves to
// { name, ok, output, seconds }; `onDone` gets each result as its part ends. Returns the exit code (1 when a part failed,
// else 0) and the summary: the number of parts, and each failed part with the command that re-runs it.
export async function runCiParts({ env = process.env, runOne, onDone = () => {} }) {
  const parts = ciPartsFor(env);
  const started = performance.now();
  const results = await runGateSteps(parts, { limit: CI_PARALLEL_LIMIT, runStep: runOne, onDone });
  const seconds = (performance.now() - started) / 1000;
  const failed = results.filter((result) => !result.ok);
  const rerun = new Map(parts.map((part) => [part.name, part.rerun]));
  const head = `ci: ${results.length} parts in ${seconds.toFixed(1)} s, one at a time, ${failed.length} failed`;
  const lines = failed.map(
    (result) => `  FAILED ${result.name}: re-run: ${rerun.get(result.name)}`,
  );
  return { code: failed.length === 0 ? 0 : 1, summary: `${[head, ...lines].join("\n")}\n` };
}
