// Tests for the second round of the Bash check (US-QG-07, issue 2554, round 2): folders, hard links, symbolic links, hook records,
// globs, script files, aliases, computed writes, and the unclear targets of a subagent. Pure: the file system is a fixed table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bashGateWrite } from "./bash-writes.mjs";

const CWD = "/repo";
const GATE_PATHS = [
  "/repo/Makefile",
  "/repo/AGENTS.md",
  "/repo/.claude/hooks/rules.mjs",
  "/repo/app/config/gates/x.json",
];
const isGate = (p) =>
  GATE_PATHS.includes(p) || (p.startsWith("/repo/.claude/") && !p.endsWith(".test.mjs"));
const folderHoldsGates = (p) => p === "/repo" || p === "/repo/.claude" || p === "/repo/app/config";
const options = (extra = {}) => ({
  gatePaths: GATE_PATHS,
  gatesIn: folderHoldsGates,
  linked: (p) => p === "/repo/hl",
  readScript: () => "",
  ...extra,
});
const verdict = (command, extra) => bashGateWrite(command, CWD, isGate, options(extra));
const decisionOf = (command, extra) => verdict(command, extra)?.decision ?? "none";

test("US-QG-07, issue 2554, round 2: an unclear target asks the main session and is refused for a subagent", () => {
  assert.equal(decisionOf("F=Makefile; sed -i s/a/b/ $F"), "ask");
  assert.equal(decisionOf("F=Makefile; sed -i s/a/b/ $F", { subagent: true }), "deny");
  assert.equal(decisionOf('echo x > "$F"'), "ask");
  assert.equal(decisionOf('echo x > "$F"', { subagent: true }), "deny");
  assert.match(
    verdict('echo x > "$F"', { subagent: true }).reason,
    /Subagents do not edit gate files/,
  );
});

test("US-QG-07, issue 2554, round 2: a folder that holds gate files is refused when a command moves, removes or links it", () => {
  assert.equal(decisionOf("mv .claude /tmp/x"), "deny");
  assert.equal(decisionOf("rm -rf .claude/hooks"), "deny");
  assert.equal(decisionOf("ln -sfn /tmp/x .claude"), "deny");
  assert.equal(
    decisionOf("cp -r src/. ."),
    "deny",
    "a recursive copy into the folder of the gate files",
  );
  assert.equal(decisionOf("rm -rf node_modules"), "none", "a throwaway folder is no gate folder");
});

test("US-QG-07, issue 2554, round 2: a copy into a folder lands under the name of its source, and the folder is not judged alone", () => {
  assert.equal(decisionOf("cp x ./"), "none", "a plain file copied into the root is no gate file");
  assert.equal(
    decisionOf("cp /tmp/Makefile ./"),
    "deny",
    "the name of the source is the gate file it writes",
  );
  assert.equal(decisionOf("cp -t . Makefile"), "deny");
  assert.equal(decisionOf("cp /tmp/x app/config/gates/x.json"), "deny");
});

test("US-QG-07, issue 2554, round 2: a hard link is refused: making one, and writing through one", () => {
  assert.equal(decisionOf("ln Makefile hl"), "deny", "the source of a hard link is a gate file");
  assert.equal(decisionOf("echo x >> hl"), "deny", "a file with a second name");
  assert.equal(decisionOf("ln -s Makefile m"), "deny", "a symbolic link to a gate file");
});

test("US-QG-07, issue 2554, round 2: the hook records are refused as write targets, by name and by a glob that can match them", () => {
  for (const command of [": > .git/claude-g*", "rm .git/*-log.jsonl", "cp x .git/*.json"]) {
    assert.equal(verdict(command)?.decision, "deny", command);
  }
  assert.match(verdict("rm .git/*-log.jsonl").reason, /writes a hook record/);
});

test("US-QG-07, issue 2554, round 2: a glob that matches a gate file is refused whatever its wildcards are", () => {
  assert.equal(decisionOf("sed -i s/a/b/ Make*"), "deny");
  assert.equal(decisionOf("sed -i s/a/b/ Mak?file"), "deny");
  assert.equal(decisionOf("sed -i s/a/b/ app/config/gates/*.json"), "deny");
  assert.equal(decisionOf("sed -i s/a/b/ app/src/*.ts"), "none");
});

test("US-QG-07, issue 2554, round 2: a script file that a shell runs is judged by its text, a missing one is unclear", () => {
  const scripts = { "/repo/s.sh": "echo x >> Makefile\n", "/repo/s.py": "print(1)\n" };
  const withFiles = options({ readScript: (abs) => (abs in scripts ? scripts[abs] : undefined) });
  assert.equal(bashGateWrite("bash s.sh", CWD, isGate, withFiles)?.decision, "deny");
  assert.equal(bashGateWrite("bash missing.sh", CWD, isGate, withFiles)?.decision, "ask");
  assert.equal(
    bashGateWrite("bash missing.sh", CWD, isGate, { ...withFiles, subagent: true })?.decision,
    "deny",
  );
  assert.equal(
    bashGateWrite("python3 s.py", CWD, isGate, withFiles)?.decision ?? "none",
    "none",
    "an interpreter's file is left to the fingerprint",
  );
});

test("US-QG-07, issue 2554, round 2: an alias stands for its value, a computed write is unclear, and make targets that rewrite files ask", () => {
  assert.equal(decisionOf("alias s=sed; s -i s/a/b/ Makefile"), "deny");
  assert.equal(
    decisionOf("node -e \"fs.writeFileSync(Buffer.from('TWFrZWZpbGU=','base64').toString(),'x')\""),
    "ask",
  );
  assert.equal(decisionOf("make format"), "ask");
  assert.equal(decisionOf("make test"), "none");
});

test("US-QG-07, issue 2554, round 2: GNU sed under its other names is sed, and wrappers with a value skip the value", () => {
  assert.equal(decisionOf("gsed -i s/a/b/ Makefile"), "deny");
  assert.equal(decisionOf("sudo -u root sed -i s/a/b/ Makefile"), "deny");
  assert.equal(
    decisionOf("time -p sed -i s/a/b/ Makefile"),
    "deny",
    "time -p is a flag, not a value",
  );
  assert.equal(
    decisionOf("command -p sed -i s/a/b/ Makefile"),
    "deny",
    "command -p is a flag, not a value",
  );
});

test("US-QG-07, issue 2554, round 2: a hook module loaded by an inline script is a deny, and a source of a process substitution asks", () => {
  assert.equal(decisionOf("node -e 'require(\"./.claude/hooks/gate-log.mjs\")'"), "deny");
  assert.equal(decisionOf("source <(echo ls)"), "ask");
});
