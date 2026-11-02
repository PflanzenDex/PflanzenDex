// Gate QG-U1 (FR-QG-09, issue 1136): Markdown summary of the Lighthouse runs in packages/web/.lighthouseci, each median
// against its limit in config/gates/quality-limits.json (`lighthouse`, the only source of the limits).
// Usage: node tools/check/release/check-lighthouse-summary.mjs [--check] [reports-dir]   (entry point: tools/lighthouse/lighthouse-summary.sh)
// --check exits 1 when a median is past its limit. Every number is the median over the runs, taken per metric, measured
// under Lighthouse's mobile emulation (simulated throttling), never on a real phone.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_DIR = fileURLToPath(
  new URL("../../../packages/web/.lighthouseci", import.meta.url),
);
const LIMITS_FILE = new URL("../../../config/gates/quality-limits.json", import.meta.url);

export function readLimits(file = LIMITS_FILE) {
  return JSON.parse(fs.readFileSync(file, "utf8")).lighthouse;
}

export function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const sumTransfer = (report, type) =>
  (report.audits["network-requests"]?.details?.items ?? [])
    .filter((r) => r.resourceType === type)
    .reduce((acc, r) => acc + (r.transferSize ?? 0), 0);

/** Raw numbers of one report; a value is null when the audit is missing (shown as "unknown", P-08). */
export function extract(report) {
  const a = report.audits ?? {};
  return {
    lcp: a["largest-contentful-paint"]?.numericValue ?? null,
    tbt: a["total-blocking-time"]?.numericValue ?? null,
    cls: a["cumulative-layout-shift"]?.numericValue ?? null,
    js: a["network-requests"]?.details ? sumTransfer(report, "Script") : null,
    weight: a["total-byte-weight"]?.numericValue ?? null,
  };
}

const medianOf = (values) => {
  const known = values.filter((v) => typeof v === "number");
  return known.length ? median(known) : null;
};

const kb = (b) => `${(b / 1000).toFixed(1)} kB`;
export const FORMATS = {
  lcp: (v) => `${(v / 1000).toFixed(2)} s`,
  tbt: (v) => `${Math.round(v)} ms`,
  cls: (v) => v.toFixed(3),
  js: kb,
  weight: kb,
};
const ROWS = [
  ["lcp", "Largest Contentful Paint (LCP)"],
  ["tbt", "Total Blocking Time (TBT)"],
  ["cls", "Cumulative Layout Shift (CLS)"],
  ["js", "Transferred JavaScript"],
  ["weight", "Total transferred bytes"],
];

export function describeEmulation(report) {
  const c = report.configSettings ?? {};
  const t = c.throttling ?? {};
  const device = /Android [^;]+; (.+?)\) AppleWebKit/.exec(
    report.environment?.networkUserAgent ?? "",
  );
  const parts = [
    `Lighthouse ${report.lighthouseVersion ?? "unknown"}`,
    `form factor ${c.formFactor ?? "unknown"}`,
    `throttling ${c.throttlingMethod ?? "unknown"}`,
    t.rttMs !== undefined ? `${t.rttMs} ms RTT` : null,
    t.throughputKbps !== undefined ? `${Math.round(t.throughputKbps)} kbit/s` : null,
    t.cpuSlowdownMultiplier !== undefined ? `${t.cpuSlowdownMultiplier}x CPU slowdown` : null,
    device ? `device profile ${device[1]}` : null,
  ];
  return parts.filter(Boolean).join(", ");
}

/** Metric keys of `extract` and the name of their limit in quality-limits.json. */
const METRIC_LIMITS = { lcp: "maxLcpMs", tbt: "maxTbtMs", cls: "maxCls" };
/** A hint to tighten a limit when a score beats it by this many points or a metric stays below this share of it. */
export const TIGHTEN = { scorePoints: 5, metricShare: 0.5 };

/** Medians of the runs: category scores (0-100) and the raw metrics of `extract`; null when unknown (P-08). */
export function medians(reports) {
  const scores = {};
  for (const r of reports)
    for (const [name, cat] of Object.entries(r.categories ?? {}))
      scores[name] = [...(scores[name] ?? []), cat.score];
  const raw = reports.map(extract);
  const metrics = Object.fromEntries(ROWS.map(([key]) => [key, medianOf(raw.map((x) => x[key]))]));
  return {
    scores: Object.fromEntries(
      Object.entries(scores).map(([n, s]) => [
        n,
        medianOf(s) === null ? null : Math.round(medianOf(s) * 100),
      ]),
    ),
    metrics,
  };
}

/** Compares the medians with the limits: failures name metric, value and limit; hints say a limit can be tightened. */
export function assess({ scores, metrics }, limits) {
  const failures = [];
  const hints = [];
  for (const [name, min] of Object.entries(limits.minScores)) {
    const v = scores[name];
    if (v === null || v === undefined) failures.push(`${name} score unknown (limit ${min})`);
    else if (v < min) failures.push(`${name} score ${v} is below the limit ${min}`);
    else if (v - min >= TIGHTEN.scorePoints)
      hints.push(`${name} score ${v} beats its limit ${min}`);
  }
  for (const [key, field] of Object.entries(METRIC_LIMITS)) {
    const max = limits[field];
    const v = metrics[key];
    if (v === null || v === undefined) failures.push(`${key} unknown (limit ${FORMATS[key](max)})`);
    else if (v > max)
      failures.push(`${key} ${FORMATS[key](v)} is above the limit ${FORMATS[key](max)}`);
    else if (v < max * TIGHTEN.metricShare && max > 0)
      hints.push(`${key} ${FORMATS[key](v)} beats its limit ${FORMATS[key](max)}`);
  }
  return { failures, hints };
}

const SCORE_ROWS = ["performance", "accessibility", "best-practices", "seo"];

/** Markdown: every median next to its limit, then what is past a limit and what could be tightened. */
export function summarize(reports, limits) {
  if (!reports.length) throw new Error("no Lighthouse reports");
  const m = medians(reports);
  const { failures, hints } = assess(m, limits);
  const show = (key, v) => (v === null || v === undefined ? "unknown" : FORMATS[key](v));
  const names = [...new Set([...SCORE_ROWS, ...Object.keys(m.scores)])];
  const lines = [
    `### Lighthouse (mobile, median of ${reports.length} runs; blocking, limits in config/gates/quality-limits.json, FR-QG-09)`,
    "",
    "| Category | Score | Limit |",
    "| --- | --- | --- |",
    ...names.map(
      (n) =>
        `| ${n} | ${m.scores[n] ?? "unknown"} | ${limits.minScores[n] === undefined ? "–" : `≥ ${limits.minScores[n]}`} |`,
    ),
    "",
    "| Metric | Median | Limit |",
    "| --- | --- | --- |",
    ...ROWS.map(([key, label]) => {
      const field = METRIC_LIMITS[key];
      return `| ${label} | ${show(key, m.metrics[key])} | ${field ? `≤ ${FORMATS[key](limits[field])}` : "report"} |`;
    }),
    "",
    failures.length
      ? `**Past the limit:** ${failures.join("; ")}.`
      : "All values within their limits.",
    ...(hints.length
      ? ["", `Could be tightened (starting values, FR-QG-09): ${hints.join("; ")}.`]
      : []),
    "",
    `Emulated, not measured on a real phone: ${describeEmulation(reports[0])}. Local \`vite preview\` start page, no signed-in views.`,
  ];
  return { markdown: lines.join("\n"), failures };
}

export function readReports(dir) {
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^run-.*\.json$/.test(f))
    : [];
  if (!files.length) throw new Error(`no Lighthouse reports in ${dir}`);
  return files.sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  try {
    const { markdown, failures } = summarize(
      readReports(args.find((a) => a !== "--check") ?? DEFAULT_DIR),
      readLimits(),
    );
    console.log(markdown);
    if (check && failures.length) {
      console.error(`QG-U1 Lighthouse: past the limit: ${failures.join("; ")}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
