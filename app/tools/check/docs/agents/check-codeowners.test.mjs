import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { checkCodeowners, parseCodeowners, patternToRegExp } from "./check-codeowners.mjs";

const OWNERS = "@konradhe14 @MaxNize @NiklasKoch-14";
const isGate = (file) =>
  file === "Makefile" || file.startsWith(".claude/") || file.endsWith(".test.mjs");
const files = [
  "Makefile",
  ".claude/settings.json",
  "app/a.test.mjs",
  "app/src/app.ts",
  "docs/readme.md",
];
const good = `# comment\n/Makefile ${OWNERS}\n/.claude/ ${OWNERS}\n/app/**/*.test.mjs ${OWNERS}\n`;

test("US-QG-07: parseCodeowners drops comments and blank lines and splits the owners", () => {
  assert.deepEqual(parseCodeowners(`# x\n\n/a/ @one @two # note\n`), [
    { line: 3, pattern: "/a/", owners: ["@one", "@two"] },
  ]);
});

test("US-QG-07: patternToRegExp reads anchors, directories and wildcards as gitignore does", () => {
  assert.ok(patternToRegExp("/.claude/").test(".claude/hooks/rules.mjs"));
  assert.ok(patternToRegExp("/Makefile").test("Makefile"));
  assert.ok(!patternToRegExp("/Makefile").test("app/Makefile"));
  assert.ok(patternToRegExp("/app/**/*.mjs").test("app/tools/check/a.mjs"));
  assert.ok(patternToRegExp("/app/config/gates/*.json").test("app/config/gates/a.json"));
  assert.ok(!patternToRegExp("/app/config/gates/*.json").test("app/config/gates/baselines/a.json"));
  assert.ok(patternToRegExp("/.github/dependabot.y*ml").test(".github/dependabot.yml"));
});

test("US-QG-07: CODEOWNERS that covers every gate file and no other file passes", () => {
  assert.deepEqual(checkCodeowners({ text: good, files, isGate }), []);
});

test("US-QG-07: a gate file without a CODEOWNERS line fails", () => {
  const text = good.replace(`/Makefile ${OWNERS}\n`, "");
  assert.match(
    checkCodeowners({ text, files, isGate }).join(),
    /gate file Makefile has no CODEOWNERS line/,
  );
});

test("US-QG-07: a line that owns a file that is no gate file fails, so does a * default line", () => {
  const star = checkCodeowners({ text: `${good}* ${OWNERS}\n`, files, isGate }).join();
  assert.match(star, /line 5 \(\*\): owns 2 file\(s\) that are no gate files/);
  const folder = checkCodeowners({ text: `${good}/docs/ ${OWNERS}\n`, files, isGate }).join();
  assert.match(folder, /docs\/readme\.md/);
});

test("US-QG-07: a line without the three owners fails", () => {
  const text = good.replace(`/Makefile ${OWNERS}`, "/Makefile @MaxNize");
  assert.match(
    checkCodeowners({ text, files, isGate }).join(),
    /owners must be @konradhe14 @MaxNize @NiklasKoch-14/,
  );
});

test("US-QG-07: a literal path that is no gate path fails even when no file exists yet", () => {
  const text = `${good}/nowhere.txt ${OWNERS}\n/.claude/new/ ${OWNERS}\n`;
  const problems = checkCodeowners({ text, files, isGate });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /nowhere\.txt\): names a path that is no gate path/);
});

test("US-QG-07: the real CODEOWNERS and the files git tracks are in step with isGateFile", () => {
  const root = fileURLToPath(new URL("../../../../..", import.meta.url));
  const listed = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  assert.equal(listed.status, 0);
  const text = fs.readFileSync(`${root}/.github/CODEOWNERS`, "utf8");
  assert.deepEqual(checkCodeowners({ text, files: listed.stdout.split("\0").filter(Boolean) }), []);
});
