// Validates the principles register in docs/guides/principles (US-QG-06, FR-DEV-04).
//   PRIN-1  frontmatter incomplete (id, title, maturity, spec) or maturity unknown
//   PRIN-2  id duplicated, or file name does not start with the id
//   PRIN-3  a section required for the maturity level is missing or empty
//   PRIN-4  a repo path or make target in "Checked by" / "Gate" does not exist
//   PRIN-5  blocking_from on a gated entry: the switch is done, the field goes (criterion 2)
//   PRIN-6  blocking_from is not a date, or its day has come while the entry is not gated (criterion 2)
//   PRIN-7  a Caught line is malformed, dated after today, or outside Evidence (criterion 4)
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

// Today as a calendar day in the project's time zone (the register and the retro use Europe/Berlin).
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const today = () => dayFormat.format(new Date());

const pad = (n) => String(n).padStart(2, "0");

// A real calendar day written YYYY-MM-DD (no 2026-02-30). Pure calendar arithmetic, no time zone involved.
export function isCalendarDay(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const [y, mo, d] = m.slice(1).map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

// The same day `months` calendar months earlier, clamped to the length of that month (2026-03-31 minus 1 = 2026-02-28).
export function monthsBefore(day, months) {
  const [y, m, d] = day.split("-").map(Number);
  const index = y * 12 + (m - 1) - months;
  const year = Math.floor(index / 12);
  const month = index - year * 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${pad(month + 1)}-${pad(Math.min(d, last))}`;
}

// `Caught: YYYY-MM-DD, PR #<n>, <what it caught>`: the day a gate caught a real failure, the PR that fixed it, the failure.
const CAUGHT = /^Caught: (\d{4}-\d{2}-\d{2}), PR #([1-9]\d*), (\S.*)$/;
// Any line that tries to be a Caught line, plain or as a bullet, so that a malformed one is reported and not skipped.
const CAUGHT_LINE = /^(?:- )?Caught:/;
export function parseCaught(line) {
  const m = CAUGHT.exec(line.trim());
  if (!m || !isCalendarDay(m[1])) return null;
  return { date: m[1], pr: Number(m[2]), what: m[3] };
}

export function parseEntry(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: {}, sections: {} };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
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
    const segments = t.split("/");
    const isPath = segments.length > 1 && segments.every((s) => /^[\w.@-]+$/.test(s));
    return isPath ? [{ kind: "path", value: t }] : [];
  });
}

// blocking_from (criterion 2): the day from which a report-only checked entry is blocking. It is set on checked entries only.
function blockingProblems(name, meta, env) {
  if (meta.blocking_from === undefined) return [];
  if (meta.maturity === "gated")
    return [
      `PRIN-5 ${name}: a gated entry carries no blocking_from; the switch is done, remove the field`,
    ];
  if (!isCalendarDay(meta.blocking_from))
    return [`PRIN-6 ${name}: blocking_from "${meta.blocking_from}" is not a date YYYY-MM-DD`];
  if (meta.blocking_from <= env.today)
    return [
      `PRIN-6 ${name}: blocking_from ${meta.blocking_from} has come, but the entry is ${meta.maturity}, not gated; switch the gate and raise the maturity in a PR`,
    ];
  return [];
}

// Caught lines (criterion 4) sit in Evidence, one per line, in the fixed format, and never after today.
function caughtProblems(name, sections, env) {
  const problems = [];
  for (const [head, body] of Object.entries(sections)) {
    for (const line of body.split("\n").filter((l) => CAUGHT_LINE.test(l.trimStart()))) {
      const caught = parseCaught(line);
      if (head !== SECTIONS.evidence)
        problems.push(
          `PRIN-7 ${name}: a Caught line belongs in "${SECTIONS.evidence}", not in "${head}"`,
        );
      else if (!caught)
        problems.push(
          `PRIN-7 ${name}: Caught line must read "Caught: YYYY-MM-DD, PR #<n>, <what it caught>": ${line.trim()}`,
        );
      else if (caught.date > env.today)
        problems.push(`PRIN-7 ${name}: Caught date ${caught.date} is after today`);
    }
  }
  return problems;
}

// files: { "PRIN-001-x.md": text }; env: { exists(path), makeTargets: string[], today: "YYYY-MM-DD" }
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
    if (!name.toLowerCase().startsWith(`${meta.id.toLowerCase()}-`) || !name.endsWith(".md"))
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
    problems.push(...blockingProblems(name, meta, env), ...caughtProblems(name, sections, env));
  }
  return problems;
}

// The register's files by name (the quarterly review reads them the same way).
export function readRegister(root) {
  const dir = path.join(root, "docs/guides/principles");
  return Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((f) => /^prin-.*\.md$/i.test(f))
      .map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]),
  );
}

export function run(root) {
  const makefile = fs.readFileSync(path.join(root, "Makefile"), "utf8");
  const makeTargets = [...makefile.matchAll(/^([a-z-]+):/gm)].map((t) => t[1]);
  return findProblems(readRegister(root), {
    exists: (p) => fs.existsSync(path.join(root, p)),
    makeTargets,
    today: today(),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = run(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.."));
  for (const p of problems) console.error(p);
  if (problems.length) process.exit(1);
  console.log("principles register ok");
}
