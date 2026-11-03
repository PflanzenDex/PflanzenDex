// Spec references (FR-QG-03): every ID mentioned in docs/specs/product/*.md must be defined there.
// Checked families: US-<EPIC>-nn, FR-<EPIC>-nn, DM-<EPIC>-nn, NFR-nn and decisions E-nn, because only
// these are defined in the product specs. Other families (P-nn, AB-n, DS-nn, TE-nn, QG-xx, KI-Rn, D-nn,
// B-nn) live in other documents or are labels and are deliberately not checked (no false positives).
// A definition is a heading `### US-…` or a table row `| FR-… |` at the start of a line (as in check-specs).
// IDs of the dropped epic MIG stay reserved and are accepted without a definition.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSpecFiles } from "./check-specs.mjs";

const DEF = /^(?:#{2,4}\s+|\|\s*\*{0,2})((?:US|FR|DM)-[A-Z]+-\d+|NFR-\d+|E-\d+)\b/;
const REF = /(?<![A-Za-z0-9-])((?:US|FR|DM)-[A-Z]+-\d+|NFR-\d+|E-\d+)(?![A-Za-z0-9-])/g;
const RESERVED = /^(?:US|FR|DM)-MIG-\d+$/;

export function findDanglingRefs(files) {
  const defined = new Set();
  for (const text of Object.values(files))
    for (const line of text.split("\n")) {
      const id = line.match(DEF)?.[1];
      if (id) defined.add(id);
    }
  const problems = [];
  for (const [f, text] of Object.entries(files))
    text.split("\n").forEach((line, i) => {
      for (const [, id] of line.matchAll(REF))
        if (!defined.has(id) && !RESERVED.test(id))
          problems.push(`${path.basename(f)}:${i + 1}: ${id} is referenced but not defined`);
    });
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = readSpecFiles();
  const problems = findDanglingRefs(files);
  problems.forEach((p) => console.error(`check-spec-refs: ${p}`));
  if (problems.length) process.exit(1);
  console.log(
    `check-spec-refs: ${Object.keys(files).length} files, every referenced ID is defined`,
  );
}
