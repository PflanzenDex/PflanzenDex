// Tests for the main checkout guard (US-QG-07, issue #1519): where `git reset --hard` and `git clean` would run, read the
// way a shell reads a command. Pure: the place is fixed here, the git facts come from run.mjs (see worktree.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mainCheckoutRefusal } from "./main-checkout.mjs";
import { judgeCommand } from "./rules.mjs";

// The main checkout /repo and its linked worktree /repo/.worktrees/x. Folders listed here exist, so a cd into them works.
const MAIN = "/repo";
const WT = "/repo/.worktrees/x";
const FOLDERS = new Set([MAIN, WT, "/repo/.worktrees", "/repo/app", "/repo/.worktrees/x/app", "/repo/.worktrees/x/sub", "/other"]);
const placeIn = (cwd) => ({ cwd, main: MAIN, linked: [WT], isFolder: (p) => FOLDERS.has(p), realpath: (p) => p });
const FROM_MAIN = placeIn(MAIN);
const FROM_WORKTREE = placeIn(WT);

const refused = (command, where) => mainCheckoutRefusal(command, where) !== null;
const allowed = (command, where) => mainCheckoutRefusal(command, where) === null;
const assertRefused = (commands, where) => {
  for (const command of commands) assert.ok(refused(command, where), `${command} must be refused`);
};
const assertAllowed = (commands, where) => {
  for (const command of commands) assert.ok(allowed(command, where), `${command} must not be refused`);
};

test("US-QG-07: reset --hard and clean, with any flags, are refused when they would act on the main checkout", () => {
  for (const command of [
    "git reset --hard",
    "git reset --hard origin/dev",
    "git --no-pager reset --hard",
    "git -c user.name=x reset --hard",
    "git clean",
    "git clean -n",
    "git clean -fd",
    "git clean -fdx",
    "git clean --force",
  ]) {
    const reason = mainCheckoutRefusal(command, FROM_MAIN);
    assert.match(reason ?? "", /would act on the main checkout \(\/repo\)/, command);
    assert.match(reason, /worktree/, `${command} names the worktree to use`);
  }
});

test("US-QG-07: the same commands in a linked worktree are not refused (the existing question still applies)", () => {
  assertAllowed(
    [
      "git reset --hard",
      "git reset --hard origin/dev",
      "git clean -fd",
      "git clean -n",
      "git reset --soft HEAD~1",
    ],
    FROM_WORKTREE,
  );
  assertAllowed(["git reset --hard", "git clean -fd"], placeIn("/other"));
});

test("US-QG-07: git -C, --git-dir, --work-tree and GIT_DIR/GIT_WORK_TREE that name the main checkout are refused", () => {
  assertRefused(
    [
      "git -C /repo reset --hard",
      "git -C /repo clean -fd",
      "git -C .. reset --hard",
      "git -C /repo/app clean -fd",
      "git --git-dir=/repo/.git reset --hard",
      "git --git-dir /repo/.git reset --hard",
      "git --work-tree=/repo reset --hard",
      "git --work-tree /repo clean -fd",
      "GIT_DIR=/repo/.git git reset --hard",
      "GIT_WORK_TREE=/repo git clean -fd",
      "env GIT_WORK_TREE=/repo git clean -fd",
    ],
    FROM_WORKTREE,
  );
  assertRefused(["git -C /repo reset --hard", "git reset --hard --git-dir=/repo/.git"], FROM_MAIN);
});

test("US-QG-07: git -C and explicit git dir and work tree outside the main checkout are not refused", () => {
  assertAllowed(
    [
      "git -C /repo/.worktrees/x reset --hard",
      "git -C /other clean -fd",
      "git --git-dir=/other/.git --work-tree=/other reset --hard",
    ],
    FROM_MAIN,
  );
});

test("US-QG-07: a cd to the main checkout earlier in the same command is refused: in a chain, a subshell, bash -c, eval or a substitution", () => {
  assertRefused(
    [
      "cd /repo && git reset --hard",
      'cd "/repo" && git reset --hard',
      "cd /repo; git clean -fd",
      "cd /repo/app && git reset --hard",
      "cd /repo 2>&1 && git reset --hard",
      "cd /repo > /dev/null && git clean -fd",
      "(cd /repo && git reset --hard)",
      "{ cd /repo; git reset --hard; }",
      "bash -c 'cd /repo && git reset --hard'",
      "eval \"cd /repo && git clean -fd\"",
      "echo $(cd /repo && git clean -fd)",
    ],
    FROM_WORKTREE,
  );
});

test("US-QG-07: a cd into a linked worktree is not refused; a cd to a worktree from the main checkout runs there", () => {
  assertAllowed(
    [
      "cd /repo/.worktrees/x && git reset --hard",
      'cd "/repo/.worktrees/x" && git clean -fd',
      "cd /repo/.worktrees/x/app && git clean -fd",
      "cd /repo/.worktrees/x/app ; git reset --hard",
      "(cd /repo/.worktrees/x && git reset --hard)",
    ],
    FROM_MAIN,
  );
  assertRefused(["(cd /repo/.worktrees/x) ; git reset --hard", "cd /repo/app ; git reset --hard"], FROM_MAIN);
});

test("US-QG-07: a cd that may fail leaves the shell where it was, so the command is judged in both places", () => {
  // The folder does not exist yet: the cd may fail, and then the shell is still in the main checkout.
  assertRefused(
    ["cd /repo/missing ; git reset --hard", "cd /repo/.worktrees/x/missing ; git reset --hard"],
    FROM_MAIN,
  );
  // A file is not a folder: the cd fails and the shell stays in the main checkout.
  assertRefused(["cd /repo/.worktrees/x/README.md ; git reset --hard"], FROM_MAIN);
  // With && the command runs only after the cd succeeded, so it runs in the worktree.
  assertAllowed(["cd /repo/.worktrees/x/missing && git reset --hard"], FROM_MAIN);
  // From a worktree both places are linked worktree folders.
  assertAllowed(["cd missing ; git reset --hard"], FROM_WORKTREE);
});

test("US-QG-07: a relative cd from the main checkout is refused; from a worktree it is resolved and one into the main checkout is refused", () => {
  assertRefused(["cd .worktrees/x && git reset --hard", "cd app ; git clean -fd"], FROM_MAIN);
  assertRefused(["cd ../../ && git reset --hard", "cd .. && git reset --hard"], FROM_WORKTREE);
  assertAllowed(
    ["cd ../x && git reset --hard", "cd sub && git reset --hard", "cd ./app && git clean -fd", "cd .worktrees/x && git reset --hard"],
    FROM_WORKTREE,
  );
});

test("US-QG-07: a folder that cannot be told is refused: a variable, a substitution, a glob, ~, a missing cwd or no facts", () => {
  assertRefused(
    [
      'cd "$WT" && git reset --hard',
      "cd $HOME && git reset --hard",
      "cd /repo/* && git reset --hard",
      "cd ~ && git reset --hard",
      'git -C "$(git rev-parse --show-toplevel)" clean -fd',
      'git -C "$DIR" reset --hard',
      'git "$@" status',
    ],
    FROM_WORKTREE,
  );
  assertRefused(["cd ~ && git reset --hard", 'cd "$X" && git clean -fd'], FROM_MAIN);
  assertRefused(["git reset --hard", "git clean -fd"], placeIn(null));
  assertRefused(["git reset --hard"], {});
  assertRefused(["git clean -fd"], { cwd: WT, linked: [WT] });
});

test("US-QG-07: an unknown folder does not reach a later && that runs only after a known cd", () => {
  // The cd to an unknown folder is one branch of the `;`; the next cd moves the shell into the worktree for certain.
  assertAllowed(['cd "$X" ; cd /repo/.worktrees/x && git reset --hard'], FROM_WORKTREE);
});

test("US-QG-07: commands that only mention reset or clean are not judged", () => {
  assertAllowed(
    [
      'git commit -m "docs: never run git reset --hard in main"',
      'echo "git clean -fd"',
      "git commit -F - <<'EOF'\ngit reset --hard\nEOF",
      "git status",
      "git reset --soft HEAD~1",
      "git reset HEAD file",
      "git log --grep=clean",
      "make reset",
      "git -C /repo/app status",
      "echo ok > /dev/null && git status",
    ],
    FROM_MAIN,
  );
  assert.equal(mainCheckoutRefusal("git status", {}), null);
});

test("US-QG-07: a pipe or a background job does not carry its cd into the next command", () => {
  assertAllowed(["cd /repo | git reset --hard", "cd /repo & git clean -fd"], FROM_WORKTREE);
  assertRefused(["cd /repo/.worktrees/x & git reset --hard"], FROM_MAIN);
});

test("US-QG-07: a fallback after a failed command is judged where it runs; a fallback that cannot run is not", () => {
  assertRefused(["git status || git reset --hard"], FROM_MAIN);
  // The cd succeeds (the folder exists), so the fallback never runs.
  assertAllowed(["cd /repo || git reset --hard"], FROM_WORKTREE);
});

test("US-QG-07: a command that cannot be read is refused when it names reset or clean, and not otherwise", () => {
  for (const command of ['echo "unterminated git reset --hard', "git reset --hard 'x"]) {
    assert.match(mainCheckoutRefusal(command, FROM_WORKTREE) ?? "", /cannot be read well enough/, command);
  }
  assertAllowed(['echo "unterminated', "git status 'x"], FROM_WORKTREE);
});

// Review of #1519: shell comments, the words that make a command unreadable, git's unique prefixes of --hard (US-QG-07).
const decide = (command, where) => judgeCommand(command, where)?.decision ?? "allow";
const assertDecided = (commands, where, expected) => {
  for (const command of commands) assert.equal(decide(command, where), expected, `${command} from ${where.cwd}`);
};

test("US-QG-07: an unquoted # that starts a word is a comment up to the newline; the commands after it are still judged", () => {
  // The apostrophes and the words in these comments are text: nothing in them runs.
  const comments = ["# don't clean this\necho ok", "sed -n 1,5p f # it's the reset part", "echo ok # git reset --hard", "echo ok;#it's\necho ok"];
  assertDecided(comments, FROM_MAIN, "allow");
  assertDecided(comments, FROM_WORKTREE, "allow");
  // The command after the comment line is a real command, judged where it runs.
  assertRefused(["# note\ngit reset --hard", "echo ok # it's\ngit clean -fd", "echo ok;#x\ngit reset --hard"], FROM_MAIN);
});

test("US-QG-07: a # inside a word, after a $, escaped or inside quotes is text, so a reset after it is still judged", () => {
  assertAllowed(["echo a#b", "echo $#", "echo \\#", 'echo "x # y"', "echo a#b && git status"], FROM_MAIN);
  assertRefused(
    ["echo a#b; git reset --hard", "echo $# && git clean -fd", "echo \\# && git reset --hard", 'echo "x # y" && git reset --hard', "echo '# y' && git clean -fd"],
    FROM_MAIN,
  );
});

test("US-QG-07: a # comment inside $( ... ) is skipped when the substitution is read, so a reset after it is judged, not refused as unreadable", () => {
  assertDecided(["echo $(cat f # it's\n) && git reset --hard"], FROM_WORKTREE, "ask");
  assertDecided(["echo $(cat f # it's\n) && git reset --hard"], FROM_MAIN, "deny");
  assertAllowed(["echo $(cat f # it's\n) && git status"], FROM_MAIN);
});

test("US-QG-07: a command that cannot be read is refused only when it names git and reset or clean; a case or a function without git is not", () => {
  const withoutGit = [
    'case "$x" in a) echo clean;; esac',
    "case \"$x\" in a) make clean;; esac",
    "f() { echo clean; }; f",
    'echo "unterminated clean',
    'case "$x" in a) git status;; esac',
    "f() { git log; }; f",
  ];
  assertDecided(withoutGit, FROM_MAIN, "allow");
  assertDecided(withoutGit, FROM_WORKTREE, "allow");
  // Git and reset or clean both named: the command may hide a reset or clean, so it is refused as unreadable in both places.
  const withGit = [
    'case "$x" in a) git clean -fd;; esac',
    'case "$x" in a) git reset --hard;; esac',
    "f() { git reset --hard; }; f",
    'echo "unterminated git clean',
    "git reset --hard 'x",
  ];
  for (const command of withGit) {
    for (const where of [FROM_MAIN, FROM_WORKTREE]) {
      assert.match(mainCheckoutRefusal(command, where) ?? "", /cannot be read well enough/, `${command} from ${where.cwd}`);
    }
  }
});

test("US-QG-07: git accepts any unique prefix of --hard (--h, --ha, --har); each one resets hard and is judged as --hard", () => {
  // Probed with git 2.56 in a throwaway repository: --h, --ha, --har and --hard all reset the working tree; --hardx is unknown.
  assertRefused(["git reset --h HEAD", "git reset --ha HEAD", "git reset --har HEAD", "git reset HEAD --har", "git reset --har"], FROM_MAIN);
  assertDecided(["git reset --har HEAD", "git reset --ha HEAD", "git reset --h HEAD"], FROM_WORKTREE, "ask");
  // Not prefixes of --hard: git rejects --hardx, and --soft and --mixed reset without touching the working tree.
  assertAllowed(["git reset --hardx HEAD", "git reset --soft HEAD~1", "git reset --mixed HEAD"], FROM_MAIN);
});

test("US-QG-07: the verdicts that must not change: reset --soft, reset of a path, status and make clean are allowed; reset --hard and clean in a worktree ask", () => {
  const kept = ["git reset --soft HEAD~1", "git reset HEAD file", "git status", "make clean"];
  assertDecided(kept, FROM_MAIN, "allow");
  assertDecided(kept, FROM_WORKTREE, "allow");
  assertDecided(["git reset --hard", "git clean -fd"], FROM_WORKTREE, "ask");
});
