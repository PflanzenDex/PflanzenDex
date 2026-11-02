import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  median,
  extract,
  summarize,
  readReports,
  describeEmulation,
  medians,
  assess,
  readLimits,
} from "./check-lighthouse-summary.mjs";

// Real Lighthouse 13.5.0 JSON shape (trimmed to the keys the summary reads).
const item = (resourceType, transferSize) => ({ resourceType, transferSize, resourceSize: 1 });
function report({ lcp, tbt, cls, weight, items, perf = 0.9 }) {
  return {
    lighthouseVersion: "13.5.0",
    configSettings: {
      formFactor: "mobile",
      throttlingMethod: "simulate",
      throttling: { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4 },
    },
    environment: {
      networkUserAgent:
        "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 Chrome/153.0.0.0 Mobile Safari/537.36",
    },
    categories: { performance: { score: perf }, seo: { score: 1 } },
    audits: {
      "largest-contentful-paint": { numericValue: lcp },
      "total-blocking-time": { numericValue: tbt },
      "cumulative-layout-shift": { numericValue: cls },
      "total-byte-weight": { numericValue: weight },
      "network-requests": { details: { items } },
    },
  };
}
const LIMITS = {
  minScores: { performance: 85, accessibility: 95, "best-practices": 90, seo: 80 },
  maxLcpMs: 3300,
  maxTbtMs: 200,
  maxCls: 0.1,
};
const md = (reports, limits = LIMITS) => summarize(reports, limits).markdown;
const runs = [
  report({
    lcp: 3000,
    tbt: 100,
    cls: 0.1,
    weight: 90000,
    perf: 0.8,
    items: [item("Script", 1000), item("Script", 2000), item("Document", 500)],
  }),
  report({ lcp: 1000, tbt: 0, cls: 0, weight: 50000, perf: 0.95, items: [item("Script", 500)] }),
  report({
    lcp: 2000,
    tbt: 300,
    cls: 0.0834,
    weight: 70000,
    perf: 0.9,
    items: [item("Script", 4000), item("Stylesheet", 99)],
  }),
];

describe("QG-U1 Lighthouse summary", () => {
  test("QG-U1 median picks the middle value and averages the two middle values of an even count", () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
  });

  test("QG-U1 extract sums only Script transfer sizes from network-requests", () => {
    assert.equal(extract(runs[0]).js, 3000);
    assert.equal(extract(runs[2]).js, 4000);
  });

  test("QG-U1 summary shows the median of LCP, TBT, CLS, JS bytes and total weight as a Markdown table", () => {
    const out = md(runs);
    assert.match(out, /\| Metric \| Median \| Limit \|\n\| --- \| --- \| --- \|/);
    assert.match(out, /\| Largest Contentful Paint \(LCP\) \| 2\.00 s \| ≤ 3\.30 s \|/);
    assert.match(out, /\| Total Blocking Time \(TBT\) \| 100 ms \| ≤ 200 ms \|/);
    assert.match(out, /\| Cumulative Layout Shift \(CLS\) \| 0\.083 \| ≤ 0\.100 \|/);
    assert.match(out, /\| Transferred JavaScript \| 3\.0 kB \| report \|/);
    assert.match(out, /\| Total transferred bytes \| 70\.0 kB \| report \|/);
  });

  test("QG-U1 summary keeps the category score table (median, percent)", () => {
    const out = md(runs);
    assert.match(
      out,
      /\| Category \| Score \| Limit \|\n\| --- \| --- \| --- \|\n\| performance \| 90 \| ≥ 85 \|/,
    );
    assert.match(out, /\| seo \| 100 \| ≥ 80 \|/);
  });

  test("QG-U1 summary states the emulation so numbers are not read as real-device values", () => {
    const out = md(runs);
    assert.match(out, /Emulated, not measured on a real phone/);
    assert.match(out, /Lighthouse 13\.5\.0/);
    assert.match(out, /throttling simulate, 150 ms RTT, 1638 kbit\/s, 4x CPU slowdown/);
    assert.match(out, /device profile moto g power \(2022\)/);
    assert.match(out, /blocking, limits in config\/gates\/quality-limits\.json/);
  });

  test("QG-U1 a missing audit is shown as unknown, not as zero", () => {
    const bare = { categories: {}, audits: {} };
    const out = md([bare]);
    assert.match(out, /\| Transferred JavaScript \| unknown \|/);
    assert.match(out, /\| Largest Contentful Paint \(LCP\) \| unknown \|/);
    assert.match(describeEmulation(bare), /Lighthouse unknown, form factor unknown/);
  });

  test("QG-U1 readReports reads run-*.json in order and fails without reports", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-summary-"));
    assert.throws(() => readReports(dir), /no Lighthouse reports/);
    assert.throws(() => readReports(path.join(dir, "missing")), /no Lighthouse reports/);
    runs.forEach((r, i) =>
      fs.writeFileSync(path.join(dir, `run-${i + 1}.json`), JSON.stringify(r)),
    );
    fs.writeFileSync(path.join(dir, "summary.md"), "ignored");
    assert.equal(readReports(dir).length, 3);
  });
});

describe("QG-U1 · FR-QG-09 Lighthouse limits (issue 1136)", () => {
  const within = {
    scores: { performance: 93, accessibility: 100, "best-practices": 96, seo: 82 },
    metrics: { lcp: 2750, tbt: 3, cls: 0 },
  };

  test("FR-QG-09 values within their limits pass", () => {
    assert.deepEqual(assess(within, LIMITS).failures, []);
    assert.match(
      md(runs, { ...LIMITS, minScores: { performance: 85, seo: 80 } }),
      /All values within their limits/,
    );
  });

  test("FR-QG-09 a value past its limit fails and names the metric, its value and the limit", () => {
    const worse = {
      scores: { ...within.scores, performance: 80 },
      metrics: { lcp: 3400, tbt: 250, cls: 0.2 },
    };
    assert.deepEqual(assess(worse, LIMITS).failures, [
      "performance score 80 is below the limit 85",
      "lcp 3.40 s is above the limit 3.30 s",
      "tbt 250 ms is above the limit 200 ms",
      "cls 0.200 is above the limit 0.100",
    ]);
  });

  test("FR-QG-09 an unknown value fails instead of passing silently (P-10)", () => {
    const { failures } = assess(medians([{ categories: {}, audits: {} }]), LIMITS);
    assert.equal(failures.length, 7);
    assert.match(failures[0], /performance score unknown/);
  });

  test("FR-QG-09 a value far within its limit is reported as a limit that can be tightened", () => {
    assert.ok(assess(within, LIMITS).hints.some((h) => /tbt 3 ms beats its limit 200 ms/.test(h)));
  });

  test("FR-QG-09 the limits live in quality-limits.json with every score and metric the check reads", () => {
    const limits = readLimits();
    assert.deepEqual(Object.keys(limits.minScores).sort(), [
      "accessibility",
      "best-practices",
      "performance",
      "seo",
    ]);
    for (const k of ["maxLcpMs", "maxTbtMs", "maxCls"]) assert.equal(typeof limits[k], "number");
  });

  test("FR-QG-09 --check exits 1 on a value past the limit and 0 within the limits", () => {
    const script = new URL("./check-lighthouse-summary.mjs", import.meta.url).pathname;
    const run = (lcp) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-check-"));
      const ok = {
        ...runs[1],
        categories: {
          performance: { score: 0.95 },
          accessibility: { score: 1 },
          "best-practices": { score: 1 },
          seo: { score: 1 },
        },
      };
      ok.audits = { ...ok.audits, "largest-contentful-paint": { numericValue: lcp } };
      fs.writeFileSync(path.join(dir, "run-1.json"), JSON.stringify(ok));
      return spawnSync("node", [script, "--check", dir], { encoding: "utf8" });
    };
    assert.equal(run(1000).status, 0);
    const bad = run(9000);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /lcp 9\.00 s is above the limit/);
  });
});
