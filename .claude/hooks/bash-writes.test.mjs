// Tests for the Bash writes to gate files (US-QG-07, issue 2554): pure functions, a fixed place and a fixed set of gate files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bashGateWrite } from "./bash-writes.mjs";
import { tokenize } from "./shell-words.mjs";

const CWD = "/repo";
// What run.mjs answers for a path: the gate files of the main checkout, of a worktree, and everything under .claude/ that is
// no gate test (the same answer as asksBeforeEdit for these paths).
const GATE_FILES = new Set([
  "/repo/Makefile",
  "/repo/AGENTS.md",
  "/repo/.githooks/pre-commit",
  "/repo/.worktrees/x/Makefile",
]);
const isGate = (p) =>
  GATE_FILES.has(p) || (p.startsWith("/repo/.claude/") && !p.endsWith(".test.mjs"));
// Every script file of the test folder exists and is empty (a shell reads it as no commands); a missing file is tested apart.
const verdict = (command, cwd = CWD) =>
  bashGateWrite(command, cwd, isGate, { readScript: () => "" });

const denied = (command, cwd) => {
  const result = verdict(command, cwd);
  assert.equal(result?.decision, "deny", command);
  assert.match(result.reason, /^This command writes a gate file \(/, command);
};
const asked = (command, cwd) => assert.equal(verdict(command, cwd)?.decision, "ask", command);
const allowed = (command, cwd) => assert.equal(verdict(command, cwd), null, command);

test("US-QG-07, issue 2554: sed and perl in-place edits of a gate file are denied, whatever the flag cluster", () => {
  for (const command of [
    "sed -i 's/a/b/' Makefile",
    "sed -ni 's/a/b/p' AGENTS.md",
    "sed -Ei 's/a/b/' Makefile",
    "sed -i.bak 's/a/b/' Makefile",
    "sed --in-place 's/a/b/' Makefile",
    "perl -pi -e 's/a/b/' .claude/hooks/rules.mjs",
    "perl -i.bak -pe 's/a/b/' .claude/settings.json",
  ])
    denied(command);
});

test("US-QG-07, issue 2554: tee, redirections and a heredoc onto a gate file are denied", () => {
  for (const command of [
    "echo x | tee Makefile",
    "echo x | tee -a Makefile",
    "echo x >> Makefile",
    "echo x > Makefile",
    'echo x > "/repo/Makefile"',
    "echo x 2>&1 > Makefile",
    "echo x &> Makefile",
    "echo x >& Makefile",
    "cat > .claude/settings.json <<'EOF'\n{}\nEOF",
    "cat >> AGENTS.md <<EOF\nmore\nEOF",
  ])
    denied(command);
});

test("US-QG-07, issue 2554: copy, move, install, link, delete and truncate onto a gate file are denied", () => {
  for (const command of [
    "cp /tmp/x Makefile",
    "cp -f /tmp/x Makefile",
    "cp -t /repo/.claude/hooks /tmp/x",
    "mv /tmp/x AGENTS.md",
    "install -m 644 /tmp/x Makefile",
    "rsync -a /tmp/x Makefile",
    "ln -sf /tmp/x Makefile",
    "dd if=/dev/zero of=Makefile bs=1 count=1",
    "rm Makefile",
    "rm -f -- Makefile",
    "truncate -s 0 .githooks/pre-commit",
    "unlink Makefile",
  ])
    denied(command);
});

test("US-QG-07, issue 2554: a script run by python, node, perl or ruby that writes a gate file is denied", () => {
  for (const command of [
    "python3 -c \"open('Makefile','w').write('x')\"",
    "python3 -c \"import pathlib; pathlib.Path('Makefile').write_text('x')\"",
    "python3 - <<'EOF'\nopen('.claude/hooks/rules.mjs','w').write('x')\nEOF",
    "node -e \"fs.writeFileSync('Makefile','x')\"",
    "node -e \"require('fs').appendFileSync('AGENTS.md', 'x')\"",
    "perl -e \"open(F, '>Makefile')\"",
    "ruby -e \"File.write('Makefile', 'x')\"",
    "echo x | node - <<'EOF'\nfs.renameSync('/tmp/x', 'Makefile')\nEOF",
  ])
    denied(command);
});

test("US-QG-07, issue 2554: a shell that runs a write of a gate file is judged, through sh -c, eval, a heredoc, a substitution and a wrapper", () => {
  for (const command of [
    'bash -c "sed -i s/a/b/ Makefile"',
    "sh -lc 'echo x > Makefile'",
    'eval "sed -i s/a/b/ Makefile"',
    "bash <<'EOF'\nsed -i s/a/b/ Makefile\nEOF",
    "echo $(sed -i s/a/b/ Makefile)",
    "env FOO=1 sed -i s/a/b/ Makefile",
    "sudo sed -i s/a/b/ Makefile",
    "nohup cp /tmp/x Makefile",
    "{ cp /tmp/x Makefile; }",
    "echo done; sed -i s/a/b/ Makefile",
    "cd /repo && cp /tmp/x Makefile",
    "(cd /repo/.worktrees/x; sed -i s/a/b/ Makefile)",
  ])
    denied(command);
});

test("US-QG-07, issue 2554: a write of a gate file in another worktree is denied, from a cd into it or with its absolute path", () => {
  denied("cd /repo/.worktrees/x && sed -i 's/a/b/' Makefile", "/other");
  denied("sed -i 's/a/b/' /repo/.worktrees/x/Makefile", "/other");
  denied("cd /repo/.worktrees/x && sed -i 's/a/b/' Makefile", CWD);
});

test("US-QG-07, issue 2554: sed w and s///w, awk output to a file, awk in place, and curl -o onto a gate file are denied", () => {
  for (const command of [
    "sed 'w Makefile' /tmp/x",
    "sed -n '/x/w AGENTS.md' /tmp/x",
    "sed 's/a/b/w Makefile' /tmp/x",
    "awk '{print > \"Makefile\"}' /tmp/x",
    "awk -i inplace '{print}' Makefile",
    "gawk --inplace '{print}' AGENTS.md",
    "curl -o Makefile https://example.invalid/x",
    "wget -O .githooks/pre-commit https://example.invalid/x",
    "cat /tmp/x | sponge Makefile",
    "echo x >| Makefile",
    "sed -i -- 's/a/b/' Makefile",
    "cd app && cp /tmp/x ../Makefile",
  ])
    denied(command);
});

test("US-QG-07, issue 2554: a glob that names a gate file, once its wildcards count as one character, is denied", () => {
  denied("sed -i 's/a/b/' .claude/hooks/*.mjs");
});

test("US-QG-07, issue 2554: a write whose target cannot be read asks: a variable, a substitution, or a folder that is not known", () => {
  asked('echo x > "$F"');
  asked('echo x > "$(git rev-parse --git-dir)/notes.txt"');
  asked("sed -i 's/a/b/' \"$(git rev-parse --show-toplevel)/Makefile\"");
  asked("cd \"$D\" && sed -i 's/a/b/' notes.txt");
});

test("US-QG-07, issue 2554: a command that cannot be read is denied when it names a gate file, and passes when it names none", () => {
  const result = verdict('echo "unclosed > Makefile');
  assert.equal(result?.decision, "deny");
  assert.match(result.reason, /^This command cannot be read well enough to see its write targets/);
  allowed('echo "unclosed > notes.txt');
});

test("US-QG-07, issue 2554: reads and writes of other files pass, and so does a gate test", () => {
  for (const command of [
    "cat Makefile",
    "grep x Makefile > /tmp/out",
    "cp Makefile /tmp/x",
    "sed -n 1,5p Makefile",
    "sed -i 's/a/b/' app/src/x.ts",
    "sed 's/w/x/' Makefile",
    "node .claude/hooks/gate-plan.mjs",
    "node --test .claude/hooks/rules.test.mjs",
    "python3 -c \"print(open('Makefile').read())\"",
    "cat < Makefile",
    "echo x > /tmp/y",
    "make gate-plan FILES=Makefile",
    "git status",
    "rm -rf node_modules",
    "cat > .claude/hooks/rules.test.mjs <<'EOF'\nexport {};\nEOF",
    "sed -i 's/a/b/' .claude/hooks/rules.test.mjs",
    'echo "rename Makefile" > /tmp/notes.md',
    "git commit -F - <<'EOF'\nopen('Makefile','w') and rename Makefile\nEOF",
    "grep -n writeFileSync Makefile",
    "awk '$1 > 5' Makefile",
    "awk '{print > \"/tmp/o\"}' Makefile",
    "awk -F: '{print $1}' Makefile",
  ])
    allowed(command);
});

test("US-QG-07, issue 2554: the deny reason names the file as written and tells the agent to use the Edit tool", () => {
  const result = verdict("sed -i 's/a/b/' Makefile");
  assert.equal(
    result.reason,
    "This command writes a gate file (Makefile). Agents change gate files only with the Edit or Write tool, where the owner is asked (US-QG-07, issue 2554). Use the Edit tool.",
  );
});

test("US-QG-07, issue 2554: the tokenizer marks each redirection as < or >, and the target is the word after it", () => {
  const tokens = tokenize("cat < a >> b");
  assert.deepEqual(
    tokens.filter((t) => t.redir).map((t) => t.dir),
    ["<", ">", ">"],
  );
  assert.equal(tokens.at(-1).value, "b");
});
