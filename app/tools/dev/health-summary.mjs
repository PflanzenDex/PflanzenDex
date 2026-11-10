// Health summary (US-QG-08): the five worst functions by cognitive complexity, and the exception markers per kind,
// as Markdown. Runs ESLint with the cognitive threshold at 0 so every function is reported. Use in a CI job summary:
//   node tools/dev/health-summary.mjs >> "$GITHUB_STEP_SUMMARY"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MARKERS, markersOf, walkCode } from "../check/code/check-boundaries.mjs";

export function worstFive(findings) {
  return [...findings].sort((a, b) => b.value - a.value).slice(0, 5);
}

export function toMarkdown(top) {
  const rows = top.map((f) => `| ${f.file} | ${f.function} | ${f.value} |`);
  return [
    "### Five most complex functions (cognitive complexity)",
    "",
    "| File | Function | Value |",
    "|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

// Exception markers per kind (US-QG-08) over `{ file, src }` entries. `markersOf` is the gates' own parser (first five
// lines), so "with reason" is what the gates honor. A marker without a reason is not honored (MK-1 rejects it), so it
// is counted apart. Every kind is listed, zero included, so a zero is visible.
export function markerCounts(files) {
  return MARKERS.map((name) => {
    const found = files.flatMap(({ src }) => markersOf(src).filter((m) => m.name === name));
    return {
      name,
      withReason: found.filter((m) => m.reason !== "").length,
      withoutReason: found.filter((m) => m.reason === "").length,
    };
  });
}

export function markersToMarkdown(counts) {
  const rows = counts.map((c) => `| ${c.name} | ${c.withReason} | ${c.withoutReason} |`);
  return [
    "### Exception markers (count per kind)",
    "",
    "| Marker | With reason | Without reason |",
    "|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { ESLint } = await import("eslint");
  const eslint = new ESLint({
    overrideConfig: [{ rules: { "sonarjs/cognitive-complexity": ["warn", 0] } }],
  });
  const results = await eslint.lintFiles(["packages"]);
  const findings = results.flatMap((r) =>
    r.messages
      .filter((m) => m.ruleId === "sonarjs/cognitive-complexity")
      .map((m) => ({
        file: path.relative(process.cwd(), r.filePath).split(path.sep).join("/"),
        function: `line ${m.line}`,
        value: Number(m.message.match(/from (\d+) to/)?.[1] ?? 0),
      })),
  );
  console.log(toMarkdown(worstFive(findings.filter((f) => !f.file.includes(".test.")))));
  // The gates' scan set (check-boundaries `checkMarkers`, eslint.config.js): every .ts/.tsx under packages, tests included.
  const files = walkCode("packages").map((file) => ({ file, src: fs.readFileSync(file, "utf8") }));
  console.log(markersToMarkdown(markerCounts(files)));
}
