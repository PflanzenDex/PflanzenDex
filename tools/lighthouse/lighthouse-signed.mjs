// FR-QG-09 (issue 1251): Lighthouse on the signed-in screens /today and /collection, mobile, median of 3 runs each.
// Report only: nothing here judges a score. This file holds what runs without a browser: the reports of a screen, the check
// that a report shows the signed-in screen, and the Markdown summary. The browser part is lighthouse-signed-run.mjs (entry:
// lighthouse-signed.sh). Medians and number formats come from the Lighthouse gate, read only.
import fs from "node:fs";
import path from "node:path";
import {
  describeEmulation,
  FORMATS,
  medians,
} from "../../app/tools/check/release/check-lighthouse-summary.mjs";

export const RUNS_PER_SCREEN = 3;
/** The screens measured signed in: `path` is the address Lighthouse opens, `id` names its report files. */
export const SCREENS = [
  { id: "today", path: "/today", title: "Today" },
  { id: "collection", path: "/collection", title: "Collection" },
];
/** Demo user of `DEMO_SEED_PROFILE=states`, dev realm only (the password is in support/display/one-screen/sign-in.ts). */
export const SIGNED_IN_ACCOUNT = "test2";

const SCORE_ROWS = ["performance", "accessibility", "best-practices", "seo"];
const METRIC_ROWS = [
  ["lcp", "Largest Contentful Paint (LCP)"],
  ["tbt", "Total Blocking Time (TBT)"],
  ["cls", "Cumulative Layout Shift (CLS)"],
  ["js", "Transferred JavaScript"],
  ["weight", "Total transferred bytes"],
];

export const reportName = (screen, run) => `run-${screen.id}-${run}.json`;

/** One run's report. A missing, unreadable or empty report is an error, never a run that is skipped (P-10). */
export function readRun(dir, screen, run) {
  const file = path.join(dir, reportName(screen, run));
  if (!fs.existsSync(file)) throw new Error(`Lighthouse report missing: ${file}`);
  let report;
  try {
    report = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Lighthouse report unreadable: ${file} (${error.message})`);
  }
  if (!report.categories) throw new Error(`Lighthouse report without categories: ${file}`);
  return report;
}

/** The reports of all runs of one screen, in order. */
export const readScreen = (dir, screen) =>
  Array.from({ length: RUNS_PER_SCREEN }, (_, i) => readRun(dir, screen, i + 1));

const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

/**
 * Null when the page is the signed-in screen: it landed on the web app at the screen's path and the API answered a data
 * request with 200. A signed-out visit is redirected (/collection goes to the root) or shows the sign-in screen at the same
 * path (/today), so the API answer is the evidence for /today. Lighthouse clears storage unless told not to, so this check
 * is what keeps the sign-in page from being scored as the screen (P-10).
 */
export function signedInProblem({ webOrigin, apiOrigin, screenPath, landed, api }) {
  if (originOf(landed) !== webOrigin)
    return `landed on ${landed ?? "no address"}, not on the web app (sign-in provider?)`;
  const { pathname } = new URL(landed);
  if (pathname !== screenPath)
    return `opened ${screenPath} but landed on ${pathname} (signed out?)`;
  const answered = api.some(
    (request) =>
      request.statusCode === 200 &&
      originOf(request.url) === apiOrigin &&
      new URL(request.url).pathname !== "/health",
  );
  return answered ? null : "the API answered no data request with 200 (signed out?)";
}

/** The problem of one run, or null. A runtime error of Lighthouse means the page could not be measured at all. */
export function runProblem(report, screen, origins) {
  if (report.runtimeError)
    return `Lighthouse could not load the page (${report.runtimeError.code})`;
  const api = (report.audits?.["network-requests"]?.details?.items ?? []).map((item) => ({
    url: item.url,
    statusCode: item.statusCode,
  }));
  return signedInProblem({
    ...origins,
    screenPath: screen.path,
    landed: report.finalDisplayedUrl ?? report.finalUrl,
    api,
  });
}

const show = (key, value) =>
  value === null || value === undefined ? "unknown" : FORMATS[key](value);

/**
 * Markdown in the format of the start-page summary, one table pair per screen with the medians of its runs. Report only,
 * so the limit column says "report" everywhere. Called only after every run passed its signed-in check.
 */
export function summarize(byScreen, account = SIGNED_IN_ACCOUNT) {
  const lines = [
    `### Lighthouse signed in (mobile, median of ${RUNS_PER_SCREEN} runs; report only, no limits yet, FR-QG-09, #1251)`,
  ];
  for (const { screen, reports } of byScreen) {
    const { scores, metrics } = medians(reports);
    const names = [...new Set([...SCORE_ROWS, ...Object.keys(scores)])];
    lines.push(
      "",
      `#### ${screen.title} (${screen.path})`,
      "",
      "| Category | Score | Limit |",
      "| --- | --- | --- |",
      ...names.map((name) => `| ${name} | ${scores[name] ?? "unknown"} | report |`),
      "",
      "| Metric | Median | Limit |",
      "| --- | --- | --- |",
      ...METRIC_ROWS.map(([key, label]) => `| ${label} | ${show(key, metrics[key])} | report |`),
    );
  }
  lines.push(
    "",
    `Signed in as the demo user ${account} (DEMO_SEED_PROFILE=states). Every run was checked to show its screen and an API answer of 200.`,
    "",
    `Emulated, not measured on a real phone: ${describeEmulation(byScreen[0].reports[0])}. Local \`vite preview\` build against the local API.`,
  );
  return lines.join("\n");
}
