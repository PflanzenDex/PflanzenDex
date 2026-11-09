import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAgents, checkSkills } from "./check-skills.mjs";

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

const agent = `---
name: demo
description: Use when demonstrating agents.
model: haiku
tools: Bash, Read, Glob
---

Read \`app/README.md\` first.
`;
const agentEnv = { exists: (p) => p === "app/README.md" };

test("US-QG-07: a complete agent definition passes", () => {
  assert.deepEqual(checkAgents({ agents: { demo: agent }, ...agentEnv }), []);
});

test("US-QG-07: the frontmatter name must match the file name", () => {
  assert.match(
    checkAgents({ agents: { other: agent }, ...agentEnv }).join(),
    /does not match the file name/,
  );
});

test("US-QG-07: an agent without a model is reported", () => {
  const noModel = agent.replace("model: haiku\n", "");
  assert.match(checkAgents({ agents: { demo: noModel }, ...agentEnv }).join(), /model is missing/);
});

test("US-QG-07: an agent without a description is reported", () => {
  const noDescription = agent.replace("description: Use when demonstrating agents.\n", "");
  assert.match(
    checkAgents({ agents: { demo: noDescription }, ...agentEnv }).join(),
    /description is empty/,
  );
});

test("US-QG-07: a backticked repo path that does not exist is reported", () => {
  const missing = agent.replace("app/README.md", "app/missing.md");
  assert.match(
    checkAgents({ agents: { demo: missing }, ...agentEnv }).join(),
    /app\/missing\.md does not exist/,
  );
});

test("US-QG-07: an agent must not get the Agent tool", () => {
  const spawner = agent.replace("tools: Bash, Read, Glob", "tools: Bash, Agent, Read");
  assert.match(
    checkAgents({ agents: { demo: spawner }, ...agentEnv }).join(),
    /tools must not include Agent/,
  );
});

test("US-QG-07: an agent file without frontmatter is reported", () => {
  assert.match(checkAgents({ agents: { demo: "# Demo\n" }, ...agentEnv }).join(), /no frontmatter/);
});
