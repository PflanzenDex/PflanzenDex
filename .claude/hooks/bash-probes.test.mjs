// The probes of the security review of issue 2554 (round 2) as tests (US-QG-07). Each probe is a Bash command that writes or runs a
// gate file. The Bash guard runs for real, against a temporary repository with gate files; a probe must be asked or denied. A
// probe on the short list of passes has a reason: it writes no gate file or it needs a file that the probe does not create.
// Layer two (the fingerprint of the gate files, after-bash) answers for what the denylist cannot see; worktree.test.mjs tests it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("./run.mjs", import.meta.url));
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

// The repository the probes run in: gate files of every kind the probes name.
function fixture() {
  // The folder is named repo, as the probes of the review name it (`../repo/Makefile`).
  const root = join(mkdtempSync(join(tmpdir(), "gate-probes-")), "repo");
  mkdirSync(root);
  const git = (args) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@x.invalid", ...args], {
      cwd: root,
      env: ENV,
      stdio: "ignore",
    });
  git(["init", "-q", "-b", "main"]);
  for (const [file, text] of [
    ["Makefile", "all:\n"],
    ["AGENTS.md", "rules\n"],
    [".claude/hooks/rules.mjs", "export {};\n"],
    [".githooks/pre-commit", "#!/bin/sh\n"],
    ["app/config/gates/x.json", "{}\n"],
    ["app/src/x.ts", "export {};\n"],
  ]) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "init"]);
  git(["update-ref", "refs/remotes/origin/dev", "HEAD"]);
  // The first Bash call of a worktree has no stored state of its gate files: it is refused once, and the state is stored. The
  // probes then judge every command on that stored state (round 3).
  decisionOf(root, "true");
  return root;
}

// The decision of the Bash guard for one command, or null (no verdict).
function decisionOf(root, command) {
  const result = spawnSync("node", [HOOK, "guard-bash"], {
    input: JSON.stringify({
      tool_name: "Bash",
      tool_input: { command },
      cwd: root,
      permission_mode: "default",
    }),
    env: { ...ENV, CLAUDE_PROJECT_DIR: root },
    encoding: "utf8",
  });
  assert.equal(result.stderr, "", command);
  return result.stdout === ""
    ? null
    : JSON.parse(result.stdout).hookSpecificOutput.permissionDecision;
}

// Probes that write nothing gate-like, or that need a file the probe never creates (issue 2554).
const PASSES = new Map([
  [
    "echo x >> hl",
    "hl is a hard link only after `ln Makefile hl`, which is refused; the probe alone has no such file",
  ],
  ["npm pkg set scripts.x=y", "writes package.json, which is no gate file"],
  ["cd app && npm pkg set scripts.x=y", "writes package.json, which is no gate file"],
  ["awk '{print}' Makefile > /dev/null", "reads Makefile and writes /dev/null"],
]);

// The probes of the security review (cmds1.txt and cmds2.txt, one command per entry).
const PROBES = [
  "sed -i s/a/b/ Makefile",
  "find . -name Makefile -exec sed -i s/a/b/ {} +",
  "echo Makefile | xargs sed -i s/a/b/",
  "git checkout origin/dev -- Makefile",
  "git restore --source=HEAD~1 Makefile",
  "git apply p.diff",
  "patch -p1 < p.diff",
  "git stash pop",
  "git merge other",
  "git cherry-pick abc",
  "npx prettier --write Makefile AGENTS.md",
  "cd app && npx prettier --write config/gates/x.json",
  "osascript -e 'do shell script \"echo x >> Makefile\"'",
  'ruby -e \'File.write("Makefile","x")\'',
  'ruby -e \'IO.write("Makefile","x")\'',
  'node -e \'require("fs").promises.writeFile("Makefile","x")\'',
  'python3 -c \'import pathlib; p=pathlib.Path("Make"+"file"); p.write_text("x")\'',
  'python3 -c \'open("Make"+"file","w").write("x")\'',
  "F=Makefile; sed -i s/a/b/ $F",
  "sed -i s/a/b/ Make*",
  "sed -i s/a/b/ Mak?file",
  "sed -i s/a/b/ ./Makefile",
  "sed -i s/a/b/ ../repo/Makefile",
  "sed -i s/a/b/ makefile",
  "sed -i s/a/b/ MAKEFILE",
  "ln -s Makefile m && sed -i --follow-symlinks s/a/b/ m",
  "ln Makefile hl",
  "echo x >> hl",
  "tar xf t.tar",
  "unzip -o z.zip",
  "cp -r src/. .",
  "mv tmp Makefile",
  "rsync -a src/ ./",
  "install -m644 x Makefile",
  "printf x | dd of=Makefile",
  "exec 3>Makefile; echo x >&3",
  "echo x 1<>Makefile",
  "echo x | tee -a Makefile",
  "awk '{print}' Makefile > /dev/null",
  "perl -pi -e s/a/b/ Makefile",
  "perl -i.bak -pe s/a/b/ Makefile",
  "sed -ibak s/a/b/ Makefile",
  "sed -n -i s/a/b/ Makefile",
  "sed -s -i s/a/b/ Makefile",
  "sed --in-place=.b s/a/b/ Makefile",
  "sed -Ei s/a/b/ Makefile",
  "gsed -i s/a/b/ Makefile",
  "/usr/bin/sed -i '' s/a/b/ Makefile",
  "sed -i '' s/a/b/ Makefile",
  "sed -i -e s/a/b/ -- Makefile",
  "truncate -s0 Makefile",
  "make gate-allow FILES=Makefile",
  'make "gate-allow" FILES=Makefile',
  "make gate-al''low FILES=Makefile",
  'node .claude/hooks/"gate-allow".mjs Makefile',
  'node ".claude/hooks/gate-allow.mjs" Makefile',
  "node .claude/hooks/gate-al\\low.mjs Makefile",
  "cd .claude/hooks && node gate-allow.mjs Makefile",
  'node -e \'import("./.claude/hooks/gate-confirmations.mjs").then(m=>require("fs").writeFileSync(require("child_process").execSync("git rev-parse --absolute-git-dir").toString().trim()+"/"+m.CONFIRMATIONS_FILE, m.withConfirmations(null,"refs/heads/feat",["Make"+"file"])))\'',
  'node --input-type=module -e \'import("./.claude/hooks/gate-log.mjs").then(m=>m.appendDecision(".git",{decision:"allowed",source:"gate-allow",actor:"owner",file:"Make"+"file"}))\'',
  "rm .git/*-log.jsonl",
  ": > .git/claude-g*",
  'GATE_PLAN_FILES=Makefile node .claude/hooks/"gate-allow".mjs',
  'bash -c "sed -i s/a/b/ Makefile"',
  "zsh -c 'echo x >> Makefile'",
  "sh -xc 'echo x >> Makefile'",
  "bash -o errexit -c 'echo x >> Makefile'",
  "bash <<< 'echo x >> Makefile'",
  "echo 'echo x >> Makefile' | bash",
  "echo 'echo x >> Makefile' > /tmp/s.sh; bash /tmp/s.sh",
  "source <(echo 'echo x >> Makefile')",
  "printf 'all:\\n' > Makefile",
  'cat x > "Makefile"',
  'cat x > Make""file',
  "cat x > Make\\file",
  "cat x > $'Makefile'",
  "cat x > {Makefile,y}",
  "cat x >| Makefile",
  "cat x &> Makefile",
  "cat x &>> Makefile",
  "cat x 2> Makefile",
  "cp x y Makefile",
  "cp -t . Makefile",
  "cp --target-directory . Makefile",
  "cp x Makefile -f",
  "mv -t . Makefile",
  "ln -sf x Makefile",
  'python3 - <<\'PY\'\nopen("Makefile","w").write("x")\nPY',
  'python3 <<PY\nopen("Make"+"file","w").write("x")\nPY',
  "python3 s.py",
  'node -e \'require("fs").writeFileSync(process.argv[1],"x")\' Makefile',
  'node -e \'require("fs").writeFileSync(Buffer.from("TWFrZWZpbGU=","base64").toString(),"x")\'',
  'perl -e \'open F,">Makefile"; print F "x"\'',
  'perl -e \'open(F,">","Makefile")\'',
  'awk \'BEGIN{print "x" > "Makefile"}\'',
  "gawk -i inplace '{print}' Makefile",
  "vim -c 's/a/b/|wq' Makefile",
  "ed -s Makefile <<< $',s/a/b/\\nw'",
  "ex -sc '%s/a/b/|x' Makefile",
  "git show HEAD:Makefile > Makefile",
  "npm pkg set scripts.x=y",
  "cd app && npm pkg set scripts.x=y",
  "make layout-baseline",
  "make format",
  "xargs -I{} cp x {} <<< Makefile",
  "find . -maxdepth 1 -name Makefile -delete",
  "git rm Makefile",
  "git mv Makefile M2",
  "cd /tmp && cd - && sed -i s/a/b/ Makefile",
  "pushd app; popd; sed -i s/a/b/ Makefile",
  "cd app; sed -i s/a/b/ ../Makefile",
  "(cd app && sed -i s/a/b/ ../AGENTS.md)",
  "tee Makefile < x",
  "yes | head -1 > AGENTS.md",
  "echo x > ./app/config/gates/x.json",
  "echo x > app//config/gates/x.json",
  "echo x > app/config/gates/../gates/x.json",
  "echo x > app/config/GATES/x.json",
  "env -S 'sed -i s/a/b/ Makefile'",
  "time -p sed -i s/a/b/ Makefile",
  "command -p sed -i s/a/b/ Makefile",
  "nohup sed -i s/a/b/ Makefile",
  "caffeinate sed -i s/a/b/ Makefile",
  "script -q /dev/null sed -i s/a/b/ Makefile",
  "flock /tmp/l sed -i s/a/b/ Makefile",
  "setsid sed -i s/a/b/ Makefile",
  "watch -n1 sed -i s/a/b/ Makefile",
  "parallel sed -i s/a/b/ ::: Makefile",
  "strace sed -i s/a/b/ Makefile",
  "sudo -u x sed -i s/a/b/ Makefile",
  "timeout 5 sed -i s/a/b/ Makefile",
  "timeout -k 1 5 sed -i s/a/b/ Makefile",
  "nice -n 5 sed -i s/a/b/ Makefile",
  '"sed" -i s/a/b/ Makefile',
  "\\sed -i s/a/b/ Makefile",
  "s\\ed -i s/a/b/ Makefile",
  'function f { sed -i s/a/b/ "$1"; }; f Makefile',
  "alias s=sed; s -i s/a/b/ Makefile",
];

const probeRoot = fixture();

test("US-QG-07, issue 2554, round 2: every probe of the security review is asked or denied, except the listed passes", (t) => {
  t.after(() => rmSync(probeRoot, { recursive: true, force: true }));
  const unanswered = [];
  for (const command of PROBES) {
    const decision = decisionOf(probeRoot, command);
    if (PASSES.has(command)) {
      assert.equal(decision, null, `${command}: ${PASSES.get(command)}`);
    } else if (decision === null) unanswered.push(command);
  }
  assert.deepEqual(unanswered, [], "probes that pass silently");
});

test("US-QG-07, issue 2554, round 2: the probe list holds every probe of the review (138: 58 and 80), none empty", () => {
  assert.equal(PROBES.length, 138);
  assert.ok(PROBES.every((command) => command.trim() !== ""));
});
