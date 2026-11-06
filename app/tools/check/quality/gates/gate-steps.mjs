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
