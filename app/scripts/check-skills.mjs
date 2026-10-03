// Skill check (US-DEV-04): skills live once in .agents/skills/<name>/SKILL.md and are linked from .claude/skills/<name>.
// Every skill needs a name matching its folder, a description that says when to use it, existing repo paths and a
// "## Check" section with a `make` target that exists. A skill without a concrete check command is unfinished.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_PATH = /`((?:app|Docs|scripts|\.github|\.agents|\.claude)\/[^`\s*<>]+)`/g;

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  return Object.fromEntries(
    m[1].split("\n").map((l) =>
      l
        .split(/:\s(.*)/s)
        .slice(0, 2)
        .map((v) => v?.trim() ?? ""),
    ),
  );
}

function checkOne(name, text, { makeTargets, exists }) {
  const problems = [];
  const meta = frontmatter(text);
  if (!meta) return [`${name}: SKILL.md has no frontmatter`];
  if (meta.name !== name)
    problems.push(`${name}: frontmatter name "${meta.name}" does not match the folder`);
  if (!/^Use when\b/.test(meta.description ?? ""))
    problems.push(`${name}: description must start with "Use when …" (trigger)`);
  const check = text.split(/^## Check\s*$/m)[1];
  const targets = [...(check ?? "").matchAll(/^\s*make\s+([a-z-]+)/gm)].map((m) => m[1]);
  if (targets.length === 0)
    problems.push(`${name}: "## Check" section with a make command is missing`);
  for (const t of targets)
    if (!makeTargets.includes(t)) problems.push(`${name}: make target "${t}" does not exist`);
  for (const [, p] of text.matchAll(REPO_PATH))
    if (!exists(p.replace(/[.,;:)]+$/, ""))) problems.push(`${name}: path ${p} does not exist`);
  return problems;
}

export function checkSkills({ skills, links, makeTargets, exists }) {
  const problems = Object.entries(skills).flatMap(([name, text]) =>
    checkOne(name, text, { makeTargets, exists }),
  );
  for (const name of Object.keys(skills))
    if (links[name] !== `../../.agents/skills/${name}`)
      problems.push(`${name}: .claude/skills/${name} must link to ../../.agents/skills/${name}`);
  for (const name of Object.keys(links))
    if (!(name in skills)) problems.push(`${name}: .claude/skills/${name} points to no skill`);
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const dir = (p) => (fs.existsSync(path.join(root, p)) ? fs.readdirSync(path.join(root, p)) : []);
  const skills = Object.fromEntries(
    dir(".agents/skills").map((n) => [
      n,
      fs.readFileSync(path.join(root, ".agents/skills", n, "SKILL.md"), "utf8"),
    ]),
  );
  const links = Object.fromEntries(
    dir(".claude/skills").map((n) => [n, fs.readlinkSync(path.join(root, ".claude/skills", n))]),
  );
  const makefile = fs.readFileSync(path.join(root, "Makefile"), "utf8");
  const makeTargets = [...makefile.matchAll(/^([a-z-]+):/gm)].map((m) => m[1]);
  const problems = checkSkills({
    skills,
    links,
    makeTargets,
    exists: (p) => fs.existsSync(path.join(root, p)),
  });
  problems.forEach((p) => console.error(`check-skills: ${p}`));
  if (problems.length) process.exit(1);
  console.log(`check-skills: ${Object.keys(skills).length} skills, all complete and linked`);
}
