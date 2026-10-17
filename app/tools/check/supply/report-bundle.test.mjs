import { test, describe } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  WORKING_TARGET_BYTES,
  decodeMappings,
  attributeBytes,
  groupOf,
  sumByGroup,
  buildReport,
  renderMarkdown,
} from "./report-bundle.mjs";

// Base64 VLQ for the fixtures: segments are [genCol, srcIdx, srcLine, srcCol] with relative values.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const vlq = (n) => {
  let v = n < 0 ? (-n << 1) | 1 : n << 1;
  let out = "";
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v > 0) digit |= 32;
    out += B64[digit];
  } while (v > 0);
  return out;
};
// absolute segments on one line -> a mappings string
const mappingsOf = (segs, prevSrc = 0) => {
  let prevCol = 0;
  return segs
    .map(([col, src]) => {
      const s = vlq(col - prevCol) + vlq(src - prevSrc) + vlq(0) + vlq(0);
      prevCol = col;
      prevSrc = src;
      return s;
    })
    .join(",");
};

describe("QG-U6 · report: sourcemap parsing", () => {
  test("QG-U6 · FR-QG-10 decodes the segments of a mappings string, one list per line", () => {
    const lines = decodeMappings(
      `${mappingsOf([
        [0, 0],
        [10, 1],
      ])};${mappingsOf([[3, 1]], 1)}`,
    );
    assert.deepEqual(lines, [
      [
        { col: 0, source: 0 },
        { col: 10, source: 1 },
      ],
      [{ col: 3, source: 1 }],
    ]);
  });

  test("QG-U6 · FR-QG-10 a segment without a source (one field) attributes to no source", () => {
    assert.deepEqual(decodeMappings("E"), [[{ col: 2, source: null }]]);
  });

  test("QG-U6 · FR-QG-10 bytes run from a segment to the next one, the rest of the line to the last", () => {
    const code = "aaaaabbb";
    const map = {
      sources: ["a.js", "b.js"],
      mappings: mappingsOf([
        [0, 0],
        [5, 1],
      ]),
    };
    assert.deepEqual(
      [...attributeBytes(code, map)],
      [
        ["a.js", 5],
        ["b.js", 3],
      ],
    );
  });

  test("QG-U6 · FR-QG-10 bytes before the first segment and in unmapped lines are 'unattributed', newlines included", () => {
    const code = "xx\nyyyy";
    const map = { sources: ["a.js"], mappings: `;${mappingsOf([[1, 0]])}` };
    const sums = attributeBytes(code, map);
    assert.equal(sums.get("(unattributed)"), 3 + 1);
    assert.equal(sums.get("a.js"), 3);
  });

  test("QG-U6 · FR-QG-10 the attributed bytes always add up to the code length", () => {
    const code = "0123456789\nabcdef";
    const map = {
      sources: ["a.js", "b.js"],
      mappings: `${mappingsOf([
        [2, 0],
        [6, 1],
      ])};${mappingsOf([[1, 0]], 1)}`,
    };
    const total = [...attributeBytes(code, map).values()].reduce((a, b) => a + b, 0);
    assert.equal(total, code.length);
  });
});

describe("QG-U6 · report: grouping per package", () => {
  const dir = "/repo/app/packages/web/dist/assets";
  const g = (rel) => groupOf(path.resolve(dir, rel));

  test("QG-U6 · FR-QG-10 npm packages group by name, scoped ones with scope, nested node_modules by the innermost", () => {
    assert.equal(g("../../../../../node_modules/react-dom/cjs/x.js"), "react-dom");
    assert.equal(
      g("../../../../../node_modules/@radix-ui/react-dialog/dist/i.mjs"),
      "@radix-ui/react-dialog",
    );
    assert.equal(g("../../../../../node_modules/a/node_modules/b/i.js"), "b");
  });

  test("QG-U6 · FR-QG-10 own code groups by workspace package and first directory", () => {
    assert.equal(g("../../src/wishlist/history/x.ts"), "web/wishlist");
    assert.equal(g("../../src/main.tsx"), "web/(src root)");
    assert.equal(g("../../../core/src/pokedex/rank/x.ts"), "core/pokedex");
  });

  test("QG-U6 · FR-QG-10 bundler helpers and unknown paths keep a readable label", () => {
    assert.equal(g("../../../../../../\0rolldown/runtime.js"), "(bundler runtime)");
    assert.equal(groupOf("(unattributed)"), "(unattributed)");
  });
});

describe("QG-U6 · report: summing", () => {
  test("QG-U6 · FR-QG-10 gzip bytes of a chunk are shared by the minified bytes per group and total exactly the chunk gzip", () => {
    const chunks = [
      {
        file: "assets/a.js",
        gzip: 100,
        groups: new Map([
          ["react", 75],
          ["web/x", 25],
        ]),
      },
      { file: "assets/b.js", gzip: 50, groups: new Map([["react", 10]]) },
    ];
    const rows = sumByGroup(chunks);
    assert.deepEqual(rows, [
      { group: "react", gzip: 125 },
      { group: "web/x", gzip: 25 },
    ]);
    assert.equal(
      rows.reduce((s, r) => s + r.gzip, 0),
      150,
    );
  });

  test("QG-U6 · FR-QG-10 rows are sorted largest first, ties by name", () => {
    const rows = sumByGroup([
      {
        file: "a",
        gzip: 30,
        groups: new Map([
          ["b", 1],
          ["a", 1],
          ["c", 1],
        ]),
      },
    ]);
    assert.deepEqual(
      rows.map((r) => r.group),
      ["a", "b", "c"],
    );
  });
});

describe("QG-U6 · report: whole dist and Markdown", () => {
  const code = (s) => s.repeat(200);
  function fixture() {
    const dist = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "bundle-report-")),
      "packages/web/dist",
    );
    fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
    fs.writeFileSync(
      path.join(dist, "index.html"),
      '<script type="module" src="/assets/index.js"></script>',
    );
    const body = code("abcde");
    fs.writeFileSync(path.join(dist, "assets", "index.js"), `${body}${code("fghij")}`);
    fs.writeFileSync(
      path.join(dist, "assets", "index.js.map"),
      JSON.stringify({
        sources: ["../../node_modules/react/i.js", "../../src/kernel/k.ts"],
        mappings: mappingsOf([
          [0, 0],
          [body.length, 1],
        ]),
      }),
    );
    return dist;
  }

  test("QG-U6 · FR-QG-10 reads initial chunks with their maps and totals the gzip size", () => {
    const dist = fixture();
    const report = buildReport(dist);
    const gz = zlib.gzipSync(fs.readFileSync(path.join(dist, "assets", "index.js")), {
      level: 9,
    }).length;
    assert.equal(report.total, gz);
    assert.equal(report.hasMaps, true);
    assert.deepEqual(report.packages.map((p) => p.group).sort(), ["react", "web/kernel"].sort());
    assert.equal(
      report.packages.reduce((s, p) => s + p.gzip, 0),
      gz,
    );
  });

  test("QG-U6 · FR-QG-10 without sourcemaps the report still lists the chunks and says why packages are missing", () => {
    const dist = fixture();
    fs.rmSync(path.join(dist, "assets", "index.js.map"));
    const report = buildReport(dist);
    assert.equal(report.hasMaps, false);
    assert.match(renderMarkdown(report, { limit: 152000 }), /no sourcemaps/i);
  });

  test("QG-U6 · FR-QG-10 Markdown names the 140 kB working target as an assumption, report only, and the hard limit", () => {
    const md = renderMarkdown(
      {
        total: 151700,
        hasMaps: true,
        chunks: [{ file: "assets/index.js", gzip: 151700 }],
        packages: [{ group: "react", gzip: 60000 }],
      },
      { limit: 152000 },
    );
    assert.equal(WORKING_TARGET_BYTES, 140000);
    assert.match(md, /140\.0 kB/);
    assert.match(md, /assumption/i);
    assert.match(md, /report only/i);
    assert.match(md, /152\.0 kB/);
    assert.match(md, /\| react \| 60\.0 kB \|/);
    assert.match(md, /11\.7 kB over/);
  });

  test("QG-U6 · FR-QG-10 long package lists are cut after 25 rows, the rest is one summed row", () => {
    const packages = Array.from({ length: 30 }, (_, i) => ({ group: `p${i}`, gzip: 1000 - i }));
    const md = renderMarkdown(
      { total: 30000, hasMaps: true, chunks: [], packages },
      { limit: 152000 },
    );
    assert.match(md, /\| p24 \|/);
    assert.doesNotMatch(md, /\| p25 \|/);
    assert.match(md, /\| \(5 smaller packages\) \| 4\.9 kB \|/);
  });

  test("QG-U6 · FR-QG-10 the sourceMappingURL comment of the report build does not count, so the total matches the gate", () => {
    const dist = fixture();
    const file = path.join(dist, "assets", "index.js");
    const plain = zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length;
    fs.appendFileSync(file, "\n//# sourceMappingURL=index.js.map\n");
    assert.equal(buildReport(dist).total, plain);
  });

  test("QG-U6 · FR-QG-10 under the working target the report says there is room left", () => {
    const md = renderMarkdown(
      { total: 130000, hasMaps: true, chunks: [], packages: [] },
      { limit: 152000 },
    );
    assert.match(md, /10\.0 kB (under|below)/);
  });
});
