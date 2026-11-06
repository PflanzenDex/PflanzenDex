// The steps of `npm run gates` (US-QG-01): the 23 scripts of the former `&&` chain, in that order, plus the one ESLint
// pass that baseline, constants and ui-text read (eslint-shared.mjs). `make gates` runs secrets, workflows and
// check-deps itself, before this table. The table order is the start order: heavy steps come first.

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
