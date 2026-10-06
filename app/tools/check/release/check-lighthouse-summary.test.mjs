import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  median,
  extract,
  summarize,
  readReports,
  describeEmulation,
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
    const out = summarize(runs);
    assert.match(out, /\| Metric \| Median \|\n\| --- \| --- \|/);
    assert.match(out, /\| Largest Contentful Paint \(LCP\) \| 2\.00 s \|/);
    assert.match(out, /\| Total Blocking Time \(TBT\) \| 100 ms \|/);
    assert.match(out, /\| Cumulative Layout Shift \(CLS\) \| 0\.083 \|/);
    assert.match(out, /\| Transferred JavaScript \| 3\.0 kB \|/);
    assert.match(out, /\| Total transferred bytes \| 70\.0 kB \|/);
  });

  test("QG-U1 summary keeps the category score table (median, percent)", () => {
    const out = summarize(runs);
    assert.match(
      out,
      /\| Category \| Score \|\n\| --- \| --- \|\n\| performance \| 90 \|\n\| seo \| 100 \|/,
    );
  });

  test("QG-U1 summary states the emulation so numbers are not read as real-device values", () => {
    const out = summarize(runs);
    assert.match(out, /Emulated, not measured on a real phone/);
    assert.match(out, /Lighthouse 13\.5\.0/);
    assert.match(out, /throttling simulate, 150 ms RTT, 1638 kbit\/s, 4x CPU slowdown/);
    assert.match(out, /device profile moto g power \(2022\)/);
    assert.match(out, /not targets/);
    assert.match(out, /report only, no threshold/);
  });

  test("QG-U1 a missing audit is shown as unknown, not as zero", () => {
    const bare = { categories: {}, audits: {} };
    const out = summarize([bare]);
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
