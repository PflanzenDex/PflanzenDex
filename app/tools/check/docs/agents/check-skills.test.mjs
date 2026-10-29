import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSkills } from "./check-skills.mjs";

const good = `---
name: demo
description: Use when demonstrating.
---

# Demo

1. Look at \`app/README.md\`.

## Check

\`\`\`bash
make ci
\`\`\`
`;
const env = { makeTargets: ["ci", "test"], exists: (p) => p === "app/README.md" };
const linked = { demo: "../../.agents/skills/demo" };

test("US-DEV-04: a complete, linked skill passes", () => {
  assert.deepEqual(checkSkills({ skills: { demo: good }, links: linked, ...env }), []);
});

test("US-DEV-04: a skill without a check command is unfinished", () => {
  const noCheck = good.replace(/## Check[\s\S]*/, "");
  assert.match(
    checkSkills({ skills: { demo: noCheck }, links: linked, ...env }).join(),
    /## Check/,
  );
});

test("US-DEV-04: unknown make targets, missing paths and a bad trigger are reported", () => {
  const bad = good
    .replace("make ci", "make deploy-everything")
    .replace("app/README.md", "app/missing.md")
    .replace("Use when demonstrating.", "Demonstrates things.");
  const problems = checkSkills({ skills: { demo: bad }, links: linked, ...env }).join("\n");
  assert.match(problems, /make target "deploy-everything"/);
  assert.match(problems, /app\/missing\.md does not exist/);
  assert.match(problems, /Use when/);
});

test("US-DEV-04: missing, wrong and orphaned links are reported", () => {
  assert.match(checkSkills({ skills: { demo: good }, links: {}, ...env }).join(), /must link/);
  assert.match(
    checkSkills({ skills: { demo: good }, links: { demo: "../x", old: "../y" }, ...env }).join(
      "\n",
    ),
    /points to no skill/,
  );
});

test("US-DEV-04: the frontmatter name must match the folder", () => {
  assert.match(
    checkSkills({
      skills: { other: good },
      links: { other: "../../.agents/skills/other" },
      ...env,
    }).join(),
    /does not match the folder/,
  );
});
