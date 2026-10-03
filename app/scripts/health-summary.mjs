// Health summary (US-QG-08): the five worst functions by cognitive complexity, as Markdown.
// Runs ESLint with the cognitive threshold at 0 so every function is reported. Use in a CI job summary:
//   node scripts/health-summary.mjs >> "$GITHUB_STEP_SUMMARY"
import path from "node:path";
import { fileURLToPath } from "node:url";

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
}
