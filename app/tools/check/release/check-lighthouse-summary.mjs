// Report QG-U1 (FR-QG-10, E-15): Markdown summary of the Lighthouse runs in packages/web/.lighthouseci. Report only, no threshold.
// Usage: node tools/check/release/check-lighthouse-summary.mjs [reports-dir]   (entry point: tools/lighthouse/lighthouse-summary.sh)
// Every number is the median over the runs, taken per metric. Values are measured under Lighthouse's mobile
// emulation (simulated throttling), never on a real phone, and they are not targets.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_DIR = fileURLToPath(
  new URL("../../../packages/web/.lighthouseci", import.meta.url),
);

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

export function summarize(reports) {
  if (!reports.length) throw new Error("no Lighthouse reports");
  const scoreRows = new Map();
  for (const r of reports)
    for (const [name, cat] of Object.entries(r.categories ?? {}))
      scoreRows.set(name, [...(scoreRows.get(name) ?? []), cat.score]);
  const raw = reports.map(extract);
  const lines = [
    `### Lighthouse (mobile, median of ${reports.length} runs; report only, no threshold yet, E-15)`,
    "",
    "| Category | Score |",
    "| --- | --- |",
    ...[...scoreRows].map(([name, s]) => {
      const m = medianOf(s);
      return `| ${name} | ${m === null ? "unknown" : Math.round(m * 100)} |`;
    }),
    "",
    "| Metric | Median |",
    "| --- | --- |",
    ...ROWS.map(([key, label]) => {
      const m = medianOf(raw.map((x) => x[key]));
      return `| ${label} | ${m === null ? "unknown" : FORMATS[key](m)} |`;
    }),
    "",
    `Emulated, not measured on a real phone: ${describeEmulation(reports[0])}. Local \`vite preview\` start page, no signed-in views. Numbers are measurements, not targets.`,
  ];
  return lines.join("\n");
}

export function readReports(dir) {
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^run-.*\.json$/.test(f))
    : [];
  if (!files.length) throw new Error(`no Lighthouse reports in ${dir}`);
  return files.sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(summarize(readReports(process.argv[2] ?? DEFAULT_DIR)));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
