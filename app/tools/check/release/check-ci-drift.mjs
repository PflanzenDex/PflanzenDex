import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The repository root, from this file's own place: app/tools/check/release/ is four folders below it (US-QG-02). The working
// directory does not matter: `npm run ci-drift` runs in app/ and reads the same Makefile and workflows as a run from the root.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

// Allowlist of npm/npx/node commands that do not go through make. An entry is a whole command: a command that only starts with
// it, such as `npm ci && npm test`, or that names a folder like `actions/` is not allowed.
const ALLOWED_DIRECT_COMMANDS = [["npm ci", "setup before make"]];

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
  // The target of a make call is the first word after `make` that is no flag (`-s`, `-j3`) and no assignment (`X=y`), so
  // `make -s playwright-version` names playwright-version (US-QG-02). A word-wise scan keeps the pattern free of nested quantifiers.
  for (const match of cmd.matchAll(/\bmake\b([^;&|()]*)/g)) {
    const target = match[1]
      .split(/\s+/)
      .find((word) => word && !word.startsWith("-") && !word.includes("="));
    if (target && /^[a-z][a-z0-9-]*$/.test(target)) makeCalls.push({ target, file });
  }
  // An npm, npx or node command at the start of the line or after `&&`, `;`, `|` or `(`: `cd app && npm run x` counts too.
  if (/(?:^|[;&|(])\s*(?:npm|npx|node)\s/.test(cmd)) directCommands.push({ cmd: cmd.trim(), file });
}

function isAllowedDirectCommand(cmd) {
  return ALLOWED_DIRECT_COMMANDS.some(([allowed]) => cmd === allowed);
}

// CI runs the parts of `make ci` as parallel jobs (US-QG-02, #1118). Each part is one of these targets: a workflow that calls
// all of them runs the same commands as `make ci` (CI_PARTS in app/tools/check/quality/gates/gate-steps.mjs). The database
// part is a CI service, not a target. Before this rule the check wanted a single `make ci`, which CI no longer calls.
const CI_PART_TARGETS = ["ci-gates", "ci-tests-base", "ci-tests-web", "ci-coverage", "ci-ui"];

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
  if (workflows["ci.yml"]) {
    const calledByCi = new Set(makeCalls.filter((c) => c.file === "ci.yml").map((c) => c.target));
    const missingParts = CI_PART_TARGETS.filter((target) => !calledByCi.has(target));
    if (!calledByCi.has("ci") && missingParts.length > 0) {
      findings.push(
        `ci.yml must call make ci, or every part of it (FR-QG-01): missing ${missingParts.join(", ")}`,
      );
    }
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

// The files the check reads under `root`: the Makefile and every .yml or .yaml workflow of .github/workflows. A missing Makefile
// or a folder without workflows throws, so the check can never pass on nothing (US-QG-02).
export function readRepo(root) {
  const makefilePath = path.join(root, "Makefile");
  if (!fs.existsSync(makefilePath)) throw new Error(`no Makefile at ${makefilePath}`);
  const workflowsDir = path.join(root, ".github", "workflows");
  const workflows = {};
  if (fs.existsSync(workflowsDir)) {
    for (const file of fs.readdirSync(workflowsDir)) {
      if (file.endsWith(".yml") || file.endsWith(".yaml")) {
        workflows[file] = fs.readFileSync(path.join(workflowsDir, file), "utf-8");
      }
    }
  }
  if (Object.keys(workflows).length === 0)
    throw new Error(`no workflow (.yml or .yaml) in ${workflowsDir}`);
  return { makefile: fs.readFileSync(makefilePath, "utf-8"), workflows };
}

function main() {
  let repo;
  try {
    repo = readRepo(REPO_ROOT);
  } catch (err) {
    console.error(`check-ci-drift: error: ${err.message}`);
    return 1;
  }
  const { findings, hints } = findDrift(repo);
  for (const hint of hints) console.log(`hint: ${hint}`);
  if (findings.length > 0) {
    for (const finding of findings) console.log(`check-ci-drift: ${finding}`);
    return 1;
  }
  console.log(
    `check-ci-drift: OK (${Object.keys(repo.workflows).length} workflows checked against ${REPO_ROOT}/Makefile)`,
  );
  return 0;
}

// Runs only as the script: a test that imports findDrift or readRepo must not run the check.
if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
