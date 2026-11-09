// US-DEV-05 (issue 1747): the "## Lessons" section of a pull request says what the change taught and where each lesson went:
// a gate, a skill, a pitfall (PF-nnn) or none with the reason. One line per lesson, or the single word `none`:
//   - <lesson> → gate <name> | skill <name> | PF-<nnn> | none (<why>)
// `make pr` runs this check before anything is pushed (tools/repo/pr-ready.sh). The section is written with the skill
// recap-and-learnings. HTML comments (the placeholder of a fresh draft) count as nothing.
//   PR_BODY="<body>" node app/tools/check/docs/agents/pr-lessons.mjs   exit 1 with the problems, exit 0 when the section passes
import { pathToFileURL } from "node:url";

const LESSON_FORMAT = "- <lesson> → gate <name> | skill <name> | PF-<nnn> | none (<why>)";
const NONE = /^(?:- )?none$/i;
const LESSON =
  /^- .+ (?:→|->) (?:gate [a-z0-9][a-z0-9-]*|skill [a-z0-9][a-z0-9-]*|PF-\d{3}|none \([^()]*\S[^()]*\))$/;

const normalize = (body) => body.replace(/<!--[\s\S]*?-->/g, "").replace(/\r\n?/g, "\n");

// The lines under "## Lessons" up to the next "## " heading, or undefined when the heading is missing.
function sectionLines(body) {
  const lines = normalize(body).split("\n");
  const start = lines.findIndex((line) => /^## Lessons\s*$/i.test(line));
  if (start < 0) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end < 0 ? rest : rest.slice(0, end)).map((line) => line.trim()).filter(Boolean);
}

/** The problems of the Lessons section of a PR body; an empty array when it passes. */
export function lessonsProblems(body = "") {
  const lines = sectionLines(body);
  if (lines === undefined) return ['the PR body has no "## Lessons" section'];
  if (lines.length === 0) return ['the "## Lessons" section is empty'];
  if (lines.length === 1 && NONE.test(lines[0])) return [];
  return lines
    .filter((line) => !LESSON.test(line))
    .map((line) => `not a lesson line: "${line}" (expected ${LESSON_FORMAT}, or none)`);
}

export function main(env = process.env) {
  const problems = lessonsProblems(env.PR_BODY ?? "");
  if (problems.length === 0) return 0;
  for (const problem of problems) console.error(`pr-lessons: ${problem}`);
  console.error(
    "pr-lessons: fill it in with the skill recap-and-learnings (.agents/skills/recap-and-learnings/SKILL.md)",
  );
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main());
