// Report QG-U6 (FR-QG-10, DS-08, ADR 0007 decision 5): where the initial JavaScript of the web app comes from.
// Report only: never fails, changes no threshold; the blocking gate is check-bundle-budget.mjs.
//   node tools/check/supply/report-bundle.mjs [dist-dir]   (Markdown on stdout; without a dist-dir it builds one)
// The build is `vite build --sourcemap` into a scratch directory (a CLI flag, the Vite config stays untouched). Each
// initial chunk gets its gzip size; its bytes are attributed to packages via the sourcemap and the chunk's gzip size is
// shared by those bytes, so per-package numbers are estimates (gzip is not additive) that sum to the measured total.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { initialChunks, readBudget, formatKb } from "./check-bundle-budget.mjs";

/** Working target in gzip bytes (assumption, starting value; report only, never fails). */
export const WORKING_TARGET_BYTES = 140000;
const MAX_PACKAGE_ROWS = 25;
const UNATTRIBUTED = "(unattributed)";
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Sourcemap `mappings` -> per generated line a list of { col, source } (source null when absent). */
export function decodeMappings(mappings) {
  let source = 0;
  return mappings.split(";").map((line) => {
    let col = 0;
    return line === ""
      ? []
      : line.split(",").map((seg) => {
          const fields = [];
          let value = 0;
          let shift = 0;
          for (const ch of seg) {
            const d = B64.indexOf(ch);
            value += (d & 31) << shift;
            if (d & 32) shift += 5;
            else {
              fields.push(value & 1 ? -(value >> 1) : value >> 1);
              value = 0;
              shift = 0;
            }
          }
          col += fields[0];
          if (fields.length < 4) return { col, source: null };
          source += fields[1];
          return { col, source };
        });
  });
}

/** Minified bytes (characters) per source file: a segment owns the code up to the next segment. */
export function attributeBytes(code, map) {
  const sums = new Map();
  const add = (name, n) => n > 0 && sums.set(name, (sums.get(name) ?? 0) + n);
  const lines = code.split("\n");
  decodeMappings(map.mappings).forEach((segs, i) => {
    const length = (lines[i]?.length ?? 0) + (i + 1 < lines.length ? 1 : 0); // the line break belongs to the line
    if (!segs.length) return add(UNATTRIBUTED, length);
    add(UNATTRIBUTED, segs[0].col);
    segs.forEach((s, k) => {
      const end = k + 1 < segs.length ? segs[k + 1].col : length;
      add(s.source === null ? UNATTRIBUTED : map.sources[s.source], end - s.col);
    });
  });
  for (let i = decodeMappings(map.mappings).length; i < lines.length; i++)
    add(UNATTRIBUTED, lines[i].length + (i + 1 < lines.length ? 1 : 0));
  return sums;
}

/** Label for an absolute source path: npm package, or `<workspace>/<first directory under src>`. */
export function groupOf(source) {
  if (source === UNATTRIBUTED) return source;
  if (source.includes("rolldown")) return "(bundler runtime)";
  const parts = source.split(path.sep === "\\" ? /[\\/]/ : "/");
  const nm = parts.lastIndexOf("node_modules");
  if (nm >= 0 && parts[nm + 1]) {
    return parts[nm + 1].startsWith("@") ? parts.slice(nm + 1, nm + 3).join("/") : parts[nm + 1];
  }
  const src = parts.lastIndexOf("src");
  if (src > 0) {
    const next = parts[src + 1];
    return `${parts[src - 1]}/${next && src + 2 < parts.length ? next : "(src root)"}`;
  }
  return source.replace(/^.*[\\/]/, "") || source;
}

/** Packages by gzip estimate, largest first. chunks: [{ file, gzip, groups: Map<group, minified bytes> }]. */
export function sumByGroup(chunks) {
  const totals = new Map();
  for (const { gzip, groups } of chunks) {
    const all = [...groups.values()].reduce((a, b) => a + b, 0);
    for (const [group, bytes] of groups)
      totals.set(group, (totals.get(group) ?? 0) + (gzip * bytes) / all);
  }
  return [...totals]
    .map(([group, gzip]) => ({ group, gzip: Math.round(gzip) }))
    .sort((a, b) => b.gzip - a.gzip || a.group.localeCompare(b.group));
}

/** Measure the initial chunks of a built dist; per-package numbers need `.map` files next to the chunks. */
export function buildReport(dist) {
  const chunks = initialChunks(dist).map((abs) => {
    // the trailing sourceMappingURL comment only exists in this build; the gate's build has none
    const buf = Buffer.from(
      fs.readFileSync(abs, "utf8").replace(/\n?\/\/# sourceMappingURL=[^\n]*\s*$/, ""),
    );
    const mapFile = `${abs}.map`;
    let groups = null;
    if (fs.existsSync(mapFile)) {
      const map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
      const sums = attributeBytes(buf.toString("utf8"), map);
      groups = new Map();
      for (const [source, bytes] of sums) {
        const g = groupOf(
          source === UNATTRIBUTED ? source : path.resolve(path.dirname(abs), source),
        );
        groups.set(g, (groups.get(g) ?? 0) + bytes);
      }
    }
    return {
      file: path.relative(dist, abs),
      gzip: zlib.gzipSync(buf, { level: 9 }).length,
      groups,
    };
  });
  const hasMaps = chunks.length > 0 && chunks.every((c) => c.groups);
  return {
    total: chunks.reduce((s, c) => s + c.gzip, 0),
    hasMaps,
    chunks: chunks.map(({ file, gzip }) => ({ file, gzip })).sort((a, b) => b.gzip - a.gzip),
    packages: hasMaps ? sumByGroup(chunks) : [],
  };
}

const row = (name, bytes, total) =>
  `| ${name} | ${formatKb(bytes)} | ${total ? ((bytes / total) * 100).toFixed(1) : "0.0"} % |`;

export function renderMarkdown(report, { limit = readBudget() } = {}) {
  const { total, chunks, packages, hasMaps } = report;
  const target = WORKING_TARGET_BYTES;
  const vsTarget =
    total > target
      ? `${formatKb(total - target)} over the working target`
      : `${formatKb(target - total)} under the working target (room for new code)`;
  const out = [
    "### Initial JS bundle (QG-U6, DS-08)",
    "",
    `Total **${formatKb(total)}** gzip. Hard limit (blocking gate, only ever lowered): ${formatKb(limit)}, ${formatKb(limit - total)} left. ` +
      `Working target: ${formatKb(target)} (assumption, starting value; report only, never fails): ${vsTarget}.`,
    "",
    "#### Per chunk",
    "",
    "| Chunk | gzip | share |",
    "| --- | ---: | ---: |",
    ...chunks.map((c) => row(c.file, c.gzip, total)),
    "",
    "#### Per package",
    "",
  ];
  if (hasMaps) {
    out.push(
      "Estimate: each chunk's gzip size shared by the minified bytes the sourcemap attributes to a package (sums to the total).",
      "",
      "| Package | gzip | share |",
      "| --- | ---: | ---: |",
      ...packages.slice(0, MAX_PACKAGE_ROWS).map((p) => row(p.group, p.gzip, total)),
    );
    const rest = packages.slice(MAX_PACKAGE_ROWS);
    const sum = rest.reduce((n, p) => n + p.gzip, 0);
    if (rest.length) out.push(row(`(${rest.length} smaller packages)`, sum, total));
  } else {
    out.push(
      "No sourcemaps next to the chunks, so no per-package breakdown. Run `make bundle-report`.",
    );
  }
  return `${out.join("\n")}\n`;
}

function main(argv) {
  const given = argv.find((a) => !a.startsWith("--"));
  const web = fileURLToPath(new URL("../../../packages/web", import.meta.url));
  const dist = given ?? path.join(web, "node_modules/.cache/bundle-report");
  if (!given) {
    const r = spawnSync(
      "npx",
      ["--no-install", "vite", "build", "--sourcemap", "--outDir", dist, "--emptyOutDir"],
      { cwd: web, stdio: ["ignore", process.stderr, process.stderr] },
    );
    if (r.status !== 0) {
      console.error("bundle report: the build failed (report only, not a gate)");
      return 0;
    }
  }
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    console.error(`bundle report: ${dist}/index.html not found`);
    return 0;
  }
  process.stdout.write(renderMarkdown(buildReport(dist)));
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
