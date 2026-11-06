// The numeric limits of quality-limits.json and coverage-thresholds.json for gate-direction.mjs (US-QG-07). A judged number
// loosens in one direction, given by the check that reads it: a ceiling (a maximum) is looser when raised, a floor (a minimum)
// when lowered. The tables are the one place that names each key; a key that is not listed is read it. Pure.
import { isObject } from "./gate-json.mjs";

const CEILING = "ceiling";
const FLOOR = "floor";
const PACKAGE = "package";
const PERF_BUDGETS = ["maxMedianMs", "maxP95Ms", "maxBodyKb"];
const METRICS = ["lines", "branches", "functions", "statements"];
const SCORES = ["performance", "accessibility", "best-practices", "seo"];

// Keys of quality-limits.json ("*" matches any key).
const LIMIT_RULES = [
  // ESLint maxima (eslint.config.js): a higher maximum lets more code through.
  ...[
    "complexity",
    "cognitiveComplexity",
    "maxLines",
    "maxLinesPerFunction",
    "maxDepth",
    "maxParams",
  ].map((k) => [CEILING, ["default", k]]),
  [CEILING, ["overrides", "*", "complexity"]],
  [CEILING, ["overrides", "*", "cognitiveComplexity"]],
  // Clone groups (check-duplicates.mjs): a higher bound reports fewer groups. DUP-1 fails above maxPercent, DUP-2 fails
  // only below maxPercent minus slackPercent (check-dup.mjs), so more slack fails less.
  ...["minOccurrences", "minTokens", "minLines"].map((k) => [CEILING, ["duplicates", k]]),
  [CEILING, ["dup", "maxPercent"]],
  [CEILING, ["dup", "slackPercent"]],
  [CEILING, ["crap", "max"]],
  [CEILING, ["bundle", "initialJsGzipBytes"]],
  // Lighthouse (check-lighthouse-summary.mjs): a value above a maximum fails, a score below a minimum fails.
  ...["maxLcpMs", "maxTbtMs", "maxCls"].map((k) => [CEILING, ["lighthouse", k]]),
  ...SCORES.map((s) => [FLOOR, ["lighthouse", "minScores", s]]),
  // Load budgets (budget-report.ts): a route over its budget is reported, or fails once the budget blocks.
  ...PERF_BUDGETS.map((k) => [CEILING, ["perf", "default", k]]),
  ...PERF_BUDGETS.map((k) => [CEILING, ["perf", "routes", "*", k]]),
];

// Keys of coverage-thresholds.json (check-coverage-ratchet.mjs): a value below its threshold fails; a package set to null is
// not enforced.
const COVERAGE_RULES = [
  ...METRICS.map((m) => [FLOOR, ["packages", "*", m]]),
  [PACKAGE, ["packages", "*"]],
];

const RULES_BY_FILE = new Map([
  ["app/config/gates/quality-limits.json", LIMIT_RULES],
  ["app/config/gates/coverage-thresholds.json", COVERAGE_RULES],
]);

/** The rules of a numeric gate file, or null when it has none. */
export const numberRulesOf = (path) => RULES_BY_FILE.get(path) ?? null;

const isCount = (value) => typeof value === "number" && Number.isFinite(value);
const dotted = (path) => path.join(".");
const matches = (pattern, path) =>
  pattern.length === path.length && pattern.every((part, i) => part === "*" || part === path[i]);
const ruleFor = (rules, path) => rules.find(([, pattern]) => matches(pattern, path))?.[0] ?? null;

function compareLeaf(was, now, path, state) {
  const rule = ruleFor(state.rules, path);
  const name = dotted(path);
  if (rule === PACKAGE && now === null && isObject(was)) {
    state.judged.looser.push(`${name} set to null, so no threshold is enforced`);
  } else if ((rule === CEILING || rule === FLOOR) && isCount(was) && isCount(now)) {
    const raised = now > was;
    const looser = rule === CEILING ? raised : !raised;
    (looser ? state.judged.looser : state.judged.tighter).push(
      `${name} ${raised ? "raised" : "lowered"} from ${was} to ${now}`,
    );
  } else {
    state.judged.readIt.push(`${name} changed in a way no rule judges`);
  }
}

/** Walks two parsed JSON values together; a comment key (leading `_`) is text that no check reads. */
function compareTree(was, now, path, state) {
  if (isObject(was) && isObject(now)) {
    for (const key of new Set([...Object.keys(was), ...Object.keys(now)])) {
      if (key.startsWith("_")) continue;
      const here = [...path, key];
      if (Object.hasOwn(was, key) && Object.hasOwn(now, key))
        compareTree(was[key], now[key], here, state);
      else state.judged.readIt.push(`${dotted(here)} added or removed`);
    }
  } else if (JSON.stringify(was) !== JSON.stringify(now)) {
    compareLeaf(was, now, path, state);
  }
}

/** Judges two parsed values of a numeric gate file with its rules, adding the reasons to `judged`. */
export function judgeNumbers(rules, was, now, judged) {
  compareTree(was, now, [], { rules, judged });
}
