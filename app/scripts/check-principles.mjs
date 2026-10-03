// Validates the principles register in Docs/principles (US-QG-06, FR-DEV-04).
//   PRIN-1  frontmatter incomplete (id, title, maturity, spec) or maturity unknown
//   PRIN-2  id duplicated, or file name does not start with the id
//   PRIN-3  a section required for the maturity level is missing or empty
//   PRIN-4  a repo path or make target in "Checked by" / "Gate" does not exist
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LEVELS = ["observed", "measurable", "checked", "gated"];
export const SECTIONS = {
  why: "Why it is better",
  measured: "How it is measured",
  checkedBy: "Checked by",
  gate: "Gate",
  evidence: "Evidence",
};
// Sections that must be non-empty from a maturity level on (the ladder is cumulative).
const REQUIRED = {
  observed: ["why"],
  measurable: ["why", "measured"],
  checked: ["why", "measured", "checkedBy"],
  gated: ["why", "measured", "checkedBy", "gate", "evidence"],
};

export function parseEntry(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: {}, sections: {} };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^\[(.*)\]$/, "$1").trim();
  }
  const sections = {};
  for (const part of m[2].split(/^## /m).slice(1)) {
    const [head, ...rest] = part.split("\n");
    sections[head.trim()] = rest.join("\n").trim();
  }
  return { meta, sections };
}

// Backtick tokens that look like repo paths or `make <target>`.
export function referencesOf(body) {
  const tokens = [...body.matchAll(/`([^`]+)`/g)].map((t) => t[1]);
  return tokens.flatMap((t) => {
    const mk = t.match(/^make ([a-z-]+)$/);
    if (mk) return [{ kind: "make", value: mk[1] }];
    return /^[\w.@-]+(\/[\w.@-]+)+$/.test(t) ? [{ kind: "path", value: t }] : [];
  });
}

// files: { "PRIN-001-x.md": text }; env: { exists(path), makeTargets: string[] }
export function findProblems(files, env) {
  const problems = [];
  const ids = new Map();
  for (const [name, text] of Object.entries(files)) {
    const { meta, sections } = parseEntry(text);
    const missing = ["id", "title", "maturity", "spec"].filter((k) => !meta[k]);
    if (missing.length) {
      problems.push(`PRIN-1 ${name}: frontmatter lacks ${missing.join(", ")}`);
      continue;
    }
    if (!LEVELS.includes(meta.maturity))
      problems.push(`PRIN-1 ${name}: unknown maturity "${meta.maturity}"`);
    if (ids.has(meta.id))
      problems.push(`PRIN-2 ${name}: id ${meta.id} also used in ${ids.get(meta.id)}`);
    else ids.set(meta.id, name);
    if (!name.startsWith(`${meta.id}-`) || !name.endsWith(".md"))
      problems.push(`PRIN-2 ${name}: file name must start with "${meta.id}-"`);
    for (const key of REQUIRED[meta.maturity] ?? []) {
      if (!sections[SECTIONS[key]])
        problems.push(
          `PRIN-3 ${name}: "${SECTIONS[key]}" is required at maturity ${meta.maturity}`,
        );
    }
    for (const key of ["checkedBy", "gate"]) {
      for (const ref of referencesOf(sections[SECTIONS[key]] ?? "")) {
        const ok =
          ref.kind === "make" ? env.makeTargets.includes(ref.value) : env.exists(ref.value);
        if (!ok)
          problems.push(
            `PRIN-4 ${name}: ${SECTIONS[key]} references missing ${ref.kind} ${ref.value}`,
          );
      }
    }
  }
  return problems;
}

export function run(root) {
  const dir = path.join(root, "Docs/principles");
  const files = Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((f) => /^PRIN-.*\.md$/.test(f))
      .map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]),
  );
  const makefile = fs.readFileSync(path.join(root, "Makefile"), "utf8");
  const makeTargets = [...makefile.matchAll(/^([a-z-]+):/gm)].map((t) => t[1]);
  return findProblems(files, { exists: (p) => fs.existsSync(path.join(root, p)), makeTargets });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = run(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
  for (const p of problems) console.error(p);
  if (problems.length) process.exit(1);
  console.log("principles register ok");
}
