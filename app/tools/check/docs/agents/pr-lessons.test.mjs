// US-DEV-05 (issue 1747): the Lessons section of a PR body, checked before `make pr` pushes anything.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lessonsProblems } from "./pr-lessons.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const section = (...lines) =>
  `## What and why\n\nStory: US-DEV-05\n\n## Lessons\n\n${lines.join("\n")}\n`;

test("US-DEV-05: a body without a Lessons section is refused", () => {
  const problems = lessonsProblems(
    "## What and why\n\nStory: US-DEV-05\n\n## Test evidence\n\nok\n",
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no "## Lessons" section/);
});

test("US-DEV-05: an empty Lessons section is refused", () => {
  assert.match(lessonsProblems(section())[0], /"## Lessons" section is empty/);
  assert.match(lessonsProblems(section("", "   ", ""))[0], /is empty/);
});

test("US-DEV-05: a section with only an HTML comment, the placeholder of a fresh draft, is refused", () => {
  const body = section("<!-- one line per lesson, or none -->");
  assert.match(lessonsProblems(body)[0], /is empty/);
  // A comment that spans lines and names the heading does not count as the section.
  const multi = "<!--\n## Lessons\n- x → gate y\n-->\n## Lessons\n\n<!-- fill me -->\n";
  assert.match(lessonsProblems(multi)[0], /is empty/);
});

test("US-DEV-05: `none` passes, also in capitals and with a leading dash", () => {
  assert.deepEqual(lessonsProblems(section("none")), []);
  assert.deepEqual(lessonsProblems(section("- none")), []);
  assert.deepEqual(lessonsProblems(section("None")), []);
});

test("US-DEV-05: lines of all four kinds pass with the arrow →", () => {
  const body = section(
    "- Gate hid the layout shift → gate ui-gates",
    "- Spec wording was unclear → skill spec-to-tests",
    "- Known trap with a time zone → PF-012",
    "- One-off typo → none (no rule would have caught it)",
  );
  assert.deepEqual(lessonsProblems(body), []);
});

test("US-DEV-05: lines of all four kinds pass with the ASCII arrow ->", () => {
  const body = section(
    "- Gate hid the layout shift -> gate ui-gates",
    "- Spec wording was unclear -> skill spec-to-tests",
    "- Known trap with a time zone -> PF-012",
    "- One-off typo -> none (no rule would have caught it)",
  );
  assert.deepEqual(lessonsProblems(body), []);
});

test("US-DEV-05: a malformed line is refused and named in the problem", () => {
  for (const bad of [
    "- did a thing",
    "- x → gate",
    "- x → PF-12",
    "- x → none ()",
    "- x → none",
    "- → gate ui-gates",
    "x → gate ui-gates",
  ]) {
    const problems = lessonsProblems(section(bad));
    assert.equal(problems.length, 1, bad);
    assert.ok(problems[0].includes(`"${bad}"`), problems[0]);
  }
});

test("US-DEV-05: none next to a lesson line is refused, the valid line does not carry it", () => {
  const problems = lessonsProblems(section("none", "- x → gate y"));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"none"/);
});

test("US-DEV-05: the section ends at the next ## heading, lines after it do not count", () => {
  const body = "## Lessons\n\nnone\n\n## AI involvement\n\n- x → gate y\n";
  assert.deepEqual(lessonsProblems(body), []);
  const missing = "## Lessons\n\n## AI involvement\n\n- x → gate y\n";
  assert.match(lessonsProblems(missing)[0], /is empty/);
});

test("US-DEV-05: CRLF line endings from the GitHub web editor are read like LF", () => {
  assert.deepEqual(lessonsProblems("## Lessons\r\n\r\n- x → skill recap-and-learnings\r\n"), []);
});

test("US-DEV-05: the command line exits 1 with the pointer to recap-and-learnings and 0 with none", () => {
  const cli = path.join(here, "pr-lessons.mjs");
  const run = (body) =>
    spawnSync(process.execPath, [cli], {
      env: { ...process.env, PR_BODY: body },
      encoding: "utf8",
    });
  const refused = run("## Lessons\n\n<!-- x -->\n");
  assert.equal(refused.status, 1);
  assert.match(
    refused.stderr,
    /recap-and-learnings \(\.agents\/skills\/recap-and-learnings\/SKILL\.md\)/,
  );
  const passed = run("## Lessons\n\nnone\n");
  assert.equal(passed.status, 0, passed.stderr);
});
