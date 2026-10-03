// Spec-Konsistenz (FR-QG-03, US-DEV-08): doppelte Dateinummern und doppelt definierte IDs werden abgelehnt.
// Definition einer ID: Überschrift `### US-…` oder Tabellenzeile `| FR-… |` / `| DM-… |` / `| E-nn |` am Zeilenanfang.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEF = /^(?:#{2,4}\s+|\|\s*\*{0,2})((?:US|FR|DM)-[A-Z]+-\d+|E-\d+)\b/;

export function findProblems(files) {
  const problems = [];
  const byNumber = new Map();
  for (const f of Object.keys(files)) {
    const m = path.basename(f).match(/^(\d+)-/);
    if (m) byNumber.set(m[1], [...(byNumber.get(m[1]) ?? []), path.basename(f)]);
  }
  for (const [n, names] of byNumber)
    if (names.length > 1) problems.push(`Dateinummer ${n} doppelt vergeben: ${names.join(", ")}`);
  const seen = new Map();
  for (const [f, text] of Object.entries(files)) {
    text.split("\n").forEach((line, i) => {
      const id = line.match(DEF)?.[1];
      if (!id) return;
      const where = `${path.basename(f)}:${i + 1}`;
      if (seen.has(id)) problems.push(`ID ${id} doppelt definiert: ${seen.get(id)} und ${where}`);
      else seen.set(id, where);
    });
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = fileURLToPath(new URL("../../Docs/PRODUKT-SPECS/", import.meta.url));
  const files = Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((n) => n.endsWith(".md"))
      .sort()
      .map((n) => [n, fs.readFileSync(path.join(dir, n), "utf8")]),
  );
  const problems = findProblems(files);
  problems.forEach((p) => console.error(`check-specs: ${p}`));
  if (problems.length) process.exit(1);
  console.log(
    `check-specs: ${Object.keys(files).length} Dateien, keine doppelten Nummern oder IDs`,
  );
}
