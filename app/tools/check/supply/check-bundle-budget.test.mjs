import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  INITIAL_JS_BUDGET_BYTES,
  staticImports,
  initialChunks,
  measureInitial,
  checkBudget,
  formatKb,
} from "./check-bundle-budget.mjs";

// Random base64 text compresses to about 75 % (6 of 8 bits per character), so fixture sizes are approximate.
const noise = (n) => crypto.randomBytes(n).toString("base64").slice(0, n);

function fixtureDist(files, html) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-budget-"));
  fs.mkdirSync(path.join(dist, "assets"));
  fs.writeFileSync(path.join(dist, "index.html"), html);
  for (const [name, code] of Object.entries(files))
    fs.writeFileSync(path.join(dist, "assets", name), code);
  return dist;
}

const html = (entry, preloads = []) =>
  `<!doctype html><head><script type="module" crossorigin src="/assets/${entry}"></script>` +
  preloads.map((p) => `<link rel="modulepreload" crossorigin href="/assets/${p}">`).join("") +
  `<link rel="stylesheet" href="/assets/x.css"></head><body></body>`;

describe("QG-U6 · what counts as initial", () => {
  test("QG-U6 · DS-08 static imports are found in minified and plain syntax, dynamic imports are not", () => {
    const code = [
      'import{a as b}from"./kernel-1.js";',
      'import"./side-effect-2.js";',
      "import { x } from './plain-3.js';",
      'const p=()=>import("./lazy-4.js");',
      "const q = import('./lazy-5.js');",
      'import{z}from"react";',
    ].join("\n");
    assert.deepEqual(staticImports(code).sort(), [
      "./kernel-1.js",
      "./plain-3.js",
      "./side-effect-2.js",
    ]);
  });

  test("QG-U6 · DS-08 the entry, its modulepreload links and their static imports count; a lazy route chunk does not", () => {
    const dist = fixtureDist(
      {
        "index-A.js": 'import{k}from"./kernel-B.js";const r=()=>import("./Page-C.js");',
        "kernel-B.js": 'import{s}from"./schemas-D.js";',
        "schemas-D.js": "export const s = 1;",
        "preloaded-E.js": "export const e = 1;",
        "Page-C.js": 'import{k}from"./kernel-B.js";import{only}from"./page-only-F.js";',
        "page-only-F.js": "export const only = 1;",
      },
      html("index-A.js", ["preloaded-E.js"]),
    );
    const files = initialChunks(dist).map((f) => path.basename(f));
    assert.deepEqual(files.sort(), ["index-A.js", "kernel-B.js", "preloaded-E.js", "schemas-D.js"]);
  });

  test("QG-U6 · DS-08 a cycle between chunks terminates and counts each chunk once", () => {
    const dist = fixtureDist(
      { "index-A.js": 'import"./b.js";', "b.js": 'import"./index-A.js";' },
      html("index-A.js"),
    );
    assert.equal(initialChunks(dist).length, 2);
  });

  test("QG-U6 · DS-08 fails with a clear message when index.html has no module entry or a chunk is missing", () => {
    const empty = fixtureDist({}, "<html></html>");
    assert.throws(() => initialChunks(empty), /entry/);
    const broken = fixtureDist({ "index-A.js": 'import"./gone.js";' }, html("index-A.js"));
    assert.throws(() => initialChunks(broken), /gone\.js/);
  });
});

describe("QG-U6 · budget check fails above the limit", () => {
  test("QG-U6 · measures the gzip size of the initial chunks, not the raw size", () => {
    const dist = fixtureDist(
      { "index-A.js": "a".repeat(100_000) + ";" + 'import"./k.js";', "k.js": noise(5_000) },
      html("index-A.js"),
    );
    const { total, files } = measureInitial(dist);
    assert.equal(files.length, 2);
    assert.ok(total < 10_000, `gzip total ${total} must be far below the raw 105 kB`);
    assert.ok(total > 3_000);
  });

  test("QG-U6 · a dependency of 100 kB gzip in the entry chunk fails and names measured and allowed size", () => {
    const dist = fixtureDist({ "index-A.js": noise(20_000) }, html("index-A.js"));
    const before = measureInitial(dist).total;
    assert.equal(checkBudget(before, 50_000).ok, true);
    fs.appendFileSync(path.join(dist, "assets", "index-A.js"), noise(100_000));
    const after = measureInitial(dist).total;
    const result = checkBudget(after, 50_000);
    assert.equal(result.ok, false);
    assert.ok(
      after - before > 70_000,
      "the added dependency weighs about 100 kB before gzip noise",
    );
    assert.ok(result.message.includes(formatKb(after)), result.message);
    assert.ok(result.message.includes("50.0 kB"), result.message);
  });

  test("QG-U6 · exactly at the limit passes, one byte above fails", () => {
    assert.equal(checkBudget(1000, 1000).ok, true);
    assert.equal(checkBudget(1001, 1000).ok, false);
  });

  test("QG-U6 · a lazily loaded route chunk is not counted in the budget", () => {
    const dist = fixtureDist(
      {
        "index-A.js": 'const r=()=>import("./Page-C.js");' + noise(1_000),
        "Page-C.js": noise(500_000),
      },
      html("index-A.js"),
    );
    assert.equal(checkBudget(measureInitial(dist).total, 50_000).ok, true);
  });

  test("QG-U6 · the budget is a single positive constant and kB means 1000 bytes", () => {
    assert.ok(Number.isInteger(INITIAL_JS_BUDGET_BYTES) && INITIAL_JS_BUDGET_BYTES > 0);
    assert.equal(formatKb(132_380), "132.4 kB");
  });
});
