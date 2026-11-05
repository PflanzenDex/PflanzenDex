import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readRun,
  readScreen,
  reportName,
  RUNS_PER_SCREEN,
  runProblem,
  SCREENS,
  signedInProblem,
  summarize,
} from "./lighthouse-signed.mjs";

// Folders this file makes are removed after it, also when a test fails (#1278).
const madeDirs = [];
after(() => {
  for (const dir of madeDirs) fs.rmSync(dir, { recursive: true, force: true });
});
function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  madeDirs.push(dir);
  return dir;
}

const WEB = "http://localhost:5173";
const API = "http://localhost:3000";
const ORIGINS = { webOrigin: WEB, apiOrigin: API };
const [TODAY, COLLECTION] = SCREENS;
const dataCall = { url: `${API}/specimens/cards`, statusCode: 200 };

// Real Lighthouse 13.5.0 JSON shape (trimmed to the keys the checks and the summary read).
function report({
  lcp = 2000,
  tbt = 50,
  cls = 0,
  weight = 60000,
  perf = 0.9,
  landed = `${WEB}/today`,
  api = [dataCall],
  runtimeError,
} = {}) {
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
    finalDisplayedUrl: landed,
    categories: {
      performance: { score: perf },
      accessibility: { score: 1 },
      "best-practices": { score: 1 },
      seo: { score: 0.9 },
    },
    audits: {
      "largest-contentful-paint": { numericValue: lcp },
      "total-blocking-time": { numericValue: tbt },
      "cumulative-layout-shift": { numericValue: cls },
      "total-byte-weight": { numericValue: weight },
      "network-requests": {
        details: {
          items: [
            ...api.map((call) => ({
              url: call.url,
              statusCode: call.statusCode,
              resourceType: "Fetch",
            })),
            {
              url: `${WEB}/assets/app.js`,
              statusCode: 200,
              resourceType: "Script",
              transferSize: 1000,
            },
          ],
        },
      },
    },
    ...(runtimeError ? { runtimeError } : {}),
  };
}

describe("FR-QG-09 Lighthouse on the signed-in screens (issue 1251)", () => {
  test("FR-QG-09 measures /today and /collection, three runs each, one report file per run", () => {
    assert.deepEqual(
      SCREENS.map((screen) => screen.path),
      ["/today", "/collection"],
    );
    assert.equal(RUNS_PER_SCREEN, 3);
    assert.equal(reportName(COLLECTION, 2), "run-collection-2.json");
  });

  test("FR-QG-09 the summary shows the medians of the three runs, scores and metrics", () => {
    const runs = [
      report({ lcp: 3000, perf: 0.8 }),
      report({ lcp: 1000, perf: 0.95 }),
      report({ lcp: 2000, perf: 0.9 }),
    ];
    const md = summarize([{ screen: TODAY, reports: runs }]);
    assert.match(md, /\| performance \| 90 \| report \|/);
    assert.match(md, /\| Largest Contentful Paint \(LCP\) \| 2\.00 s \| report \|/);
    assert.match(md, /\| Transferred JavaScript \| 1\.0 kB \| report \|/);
  });

  test("FR-QG-09 the summary has one table pair per screen in the format of the start-page summary", () => {
    const md = summarize([
      { screen: TODAY, reports: [report(), report(), report()] },
      { screen: COLLECTION, reports: [report(), report(), report()] },
    ]);
    assert.match(md, /^### Lighthouse signed in \(mobile, median of 3 runs; report only/);
    assert.match(
      md,
      /#### Today \(\/today\)\n\n\| Category \| Score \| Limit \|\n\| --- \| --- \| --- \|/,
    );
    assert.match(md, /#### Collection \(\/collection\)/);
    assert.match(md, /\| Metric \| Median \| Limit \|\n\| --- \| --- \| --- \|/);
    assert.match(
      md,
      /Emulated, not measured on a real phone: Lighthouse 13\.5\.0, form factor mobile/,
    );
    assert.match(md, /Signed in as the demo user test2/);
    assert.doesNotMatch(md, /Past the limit|limit \d|≤|≥/);
  });

  test("FR-QG-09 a metric no run has is shown as unknown, not as zero", () => {
    const bare = { categories: {}, audits: {}, finalDisplayedUrl: `${WEB}/today` };
    const md = summarize([{ screen: TODAY, reports: [bare, bare, bare] }]);
    assert.match(md, /\| Largest Contentful Paint \(LCP\) \| unknown \| report \|/);
    assert.match(md, /\| Transferred JavaScript \| unknown \| report \|/);
    assert.match(md, /\| performance \| unknown \| report \|/);
  });

  test("FR-QG-09 a low score is shown and never fails the summary (report only)", () => {
    const low = [report({ perf: 0.1 }), report({ perf: 0.1 }), report({ perf: 0.1 })];
    const md = summarize([{ screen: TODAY, reports: low }]);
    assert.match(md, /\| performance \| 10 \| report \|/);
  });

  test("FR-QG-09 signed-in check passes when the page is the web app at the screen path and the API answered 200", () => {
    assert.equal(runProblem(report(), TODAY, ORIGINS), null);
    assert.equal(
      runProblem(report({ landed: `${WEB}/collection`, api: [dataCall] }), COLLECTION, ORIGINS),
      null,
    );
  });

  test("FR-QG-09 signed-in check fails when /collection landed on the root (signed out, redirected)", () => {
    const problem = runProblem(report({ landed: `${WEB}/`, api: [] }), COLLECTION, ORIGINS);
    assert.match(problem, /opened \/collection but landed on \/ \(signed out\?\)/);
  });

  test("FR-QG-09 signed-in check fails on the sign-in provider's page, not on the web app", () => {
    const problem = signedInProblem({
      ...ORIGINS,
      screenPath: "/today",
      landed: "http://localhost:18081/realms/pflanzendex/protocol/openid-connect/auth",
      api: [],
    });
    assert.match(problem, /not on the web app \(sign-in provider\?\)/);
  });

  test("FR-QG-09 signed-in check fails on /today without a data answer, so a sign-in screen at the same path is not measured", () => {
    const signedOut = report({
      landed: `${WEB}/today`,
      api: [{ url: `${API}/me`, statusCode: 401 }],
    });
    assert.match(
      runProblem(signedOut, TODAY, ORIGINS),
      /the API answered no data request with 200/,
    );
  });

  test("FR-QG-09 a health check or another origin does not count as the API answer", () => {
    const api = [
      { url: `${API}/health`, statusCode: 200 },
      { url: "http://localhost:4000/specimens/cards", statusCode: 200 },
    ];
    assert.match(
      runProblem(report({ api }), TODAY, ORIGINS),
      /the API answered no data request with 200/,
    );
  });

  test("FR-QG-09 a Lighthouse runtime error means the page could not be measured", () => {
    const problem = runProblem(
      report({ runtimeError: { code: "NO_FCP", message: "no paint" } }),
      TODAY,
      ORIGINS,
    );
    assert.equal(problem, "Lighthouse could not load the page (NO_FCP)");
  });

  test("FR-QG-09 a missing run report fails the screen and names the file", () => {
    const dir = tempDir("lh-signed-");
    for (const run of [1, 2]) {
      fs.writeFileSync(path.join(dir, reportName(TODAY, run)), JSON.stringify(report()));
    }
    assert.throws(() => readScreen(dir, TODAY), /Lighthouse report missing: .*run-today-3\.json/);
  });

  test("FR-QG-09 an unreadable report or one without categories fails the run", () => {
    const dir = tempDir("lh-signed-");
    fs.writeFileSync(path.join(dir, reportName(TODAY, 1)), "{ not json");
    assert.throws(
      () => readRun(dir, TODAY, 1),
      /Lighthouse report unreadable: .*run-today-1\.json/,
    );
    fs.writeFileSync(path.join(dir, reportName(TODAY, 1)), JSON.stringify({ audits: {} }));
    assert.throws(() => readRun(dir, TODAY, 1), /Lighthouse report without categories/);
  });

  test("FR-QG-09 readScreen returns the three reports of a screen in run order", () => {
    const dir = tempDir("lh-signed-");
    [1, 2, 3].forEach((run) =>
      fs.writeFileSync(
        path.join(dir, reportName(COLLECTION, run)),
        JSON.stringify(report({ lcp: run * 1000 })),
      ),
    );
    const reports = readScreen(dir, COLLECTION);
    assert.deepEqual(
      reports.map((r) => r.audits["largest-contentful-paint"].numericValue),
      [1000, 2000, 3000],
    );
  });
});
