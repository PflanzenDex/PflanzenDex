// Allowlist of npm/npx/node commands that do not go through make.
const ALLOWED_DIRECT_COMMANDS = [
  ["npm ci", "setup before make"],
  ["actions/", "GitHub Actions setup"],
];

function extractMakeTargets(makefileText) {
  const targets = new Set();
  const documented = new Set();

  const lines = makefileText.split("\n");
  for (const line of lines) {
    const match = line.match(/^([a-z][a-z0-9-]*):.*## /);
    if (match) {
      targets.add(match[1]);
      documented.add(match[1]);
    } else {
      const bareTarget = line.match(/^([a-z][a-z0-9-]*):/);
      if (bareTarget) {
        targets.add(bareTarget[1]);
      }
    }
  }

  const undocumented = new Set([...targets].filter((t) => !documented.has(t)));

  return { targets, undocumented };
}

function extractWorkflowCalls(workflows) {
  const makeCalls = [];
  const directCommands = [];

  for (const [file, yaml] of Object.entries(workflows)) {
    const lines = yaml.split("\n");
    let inRunBlock = false;
    let runBlockIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const pipeMatch = line.match(/^(\s*)-\s*run:\s*\|/);
      if (pipeMatch) {
        inRunBlock = true;
        runBlockIndent = pipeMatch[1].length + 2;
        continue;
      }
      let singleMatch = line.match(/^(\s*)-\s*run:\s*(.+)/);
      if (singleMatch) {
        extractCallsFromLine(singleMatch[2], file, makeCalls, directCommands);
        continue;
      }
      singleMatch = line.match(/^(\s*)run:\s*(.+)/);
      if (singleMatch && !inRunBlock) {
        extractCallsFromLine(singleMatch[2], file, makeCalls, directCommands);
        continue;
      }
      if (inRunBlock) {
        const currentIndent = line.match(/^(\s*)/)[1].length;
        if (
          line.match(/^\s*-\s/) ||
          (currentIndent < runBlockIndent && line.trim() && !line.trim().startsWith("#"))
        ) {
          inRunBlock = false;
        } else if (line.trim() && !line.trim().startsWith("#")) {
          extractCallsFromLine(line.trim(), file, makeCalls, directCommands);
        }
      }
    }
  }

  return { makeCalls, directCommands };
}

function extractCallsFromLine(cmd, file, makeCalls, directCommands) {
  const makeMatches = cmd.matchAll(/make\s+([a-z][a-z0-9-]*)/g);
  for (const match of makeMatches) makeCalls.push({ target: match[1], file });
  const directMatch = cmd.match(/^(npm|npx|node)\s+/);
  if (directMatch) directCommands.push({ cmd, file });
}

function isAllowedDirectCommand(cmd) {
  for (const [pattern] of ALLOWED_DIRECT_COMMANDS) if (cmd.includes(pattern)) return true;
  return false;
}

export function findDrift({ makefile, workflows }) {
  const findings = [];
  const hints = [];
  const { targets, undocumented } = extractMakeTargets(makefile);
  const { makeCalls, directCommands } = extractWorkflowCalls(workflows);

  for (const { target, file } of makeCalls) {
    if (!targets.has(target)) {
      findings.push(`make target '${target}' called in ${file} but not defined in Makefile`);
    }
  }
  if (workflows["ci.yml"] && !makeCalls.some((c) => c.file === "ci.yml" && c.target === "ci")) {
    findings.push("ci.yml must call make ci (FR-QG-01)");
  }
  for (const { cmd, file } of directCommands) {
    if (!isAllowedDirectCommand(cmd)) {
      findings.push(`${file}: direct npm/npx/node call (should go through make): ${cmd}`);
    }
  }
  for (const target of undocumented) {
    hints.push(`Makefile target '${target}' has no ## description`);
  }
  return { findings, hints };
}

async function main() {
  const fs = await import("fs");
  const path = await import("path");
  const repoRoot = process.cwd();
  const makefilePath = path.join(repoRoot, "Makefile");
  const workflowsDir = path.join(repoRoot, ".github", "workflows");
  let makefile = "";
  if (fs.existsSync(makefilePath)) makefile = fs.readFileSync(makefilePath, "utf-8");
  const workflows = {};
  if (fs.existsSync(workflowsDir)) {
    const files = fs.readdirSync(workflowsDir);
    for (const file of files) {
      if (file.endsWith(".yml") || file.endsWith(".yaml")) {
        workflows[file] = fs.readFileSync(path.join(workflowsDir, file), "utf-8");
      }
    }
  }
  const { findings, hints } = findDrift({ makefile, workflows });
  for (const hint of hints) console.log(`hint: ${hint}`);
  if (findings.length > 0) {
    for (const finding of findings) console.log(`check-ci-drift: ${finding}`);
    process.exit(1);
  }
  console.log("check-ci-drift: OK");
}
main().catch((err) => {
  console.error("check-ci-drift: error:", err.message);
  process.exit(1);
});
