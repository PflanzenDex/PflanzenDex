// US-DEV-13: the four REST make targets (pr-state, issue-read, pr-text, issue-comment) and their permission rules. Every test runs
// rest-cli.mjs or the real make target with a fake `gh` as the first program on PATH (a script in a temp folder, its calls logged),
// so no test calls GitHub. The inputs reach the script in the environment (REST_PR, REST_ISSUE, REST_TITLE, REST_BODY).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const CLI = fileURLToPath(new URL("./rest-cli.mjs", import.meta.url));
const ROOT = new URL("../../../../../", import.meta.url);

// The fake gh: logs its arguments, answers with the first route whose endpoint and method match, fails without a route.
const FAKE_GH = `#!${process.execPath}
"use strict";
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + "\\n");
const endpoint = (args.find((a) => a.startsWith("repos/")) ?? "").split("?")[0];
const at = args.indexOf("-X");
const method = at >= 0 ? args[at + 1] : "GET";
const routes = JSON.parse(fs.readFileSync(process.env.FAKE_GH_ROUTES, "utf8"));
const hit = routes.find((r) => r.path === endpoint && (r.method ?? "GET") === method);
if (!hit) {
  process.stderr.write("fake gh: no route for " + method + " " + endpoint + "\\n");
  process.exit(1);
}
process.stderr.write(hit.stderr ?? "");
process.stdout.write(hit.stdout ?? "");
process.exit(hit.code ?? 0);
`;

const SHA = "a".repeat(40);
const REPO = { path: "repos/{owner}/{repo}", stdout: "octo/app\n" };
const PR = {
  number: 5,
  title: "feat(acc): sign in (US-ACC-01)",
  state: "open",
  merged: false,
  draft: true,
  head: { sha: SHA },
  base: { ref: "dev" },
  auto_merge: null,
  html_url: "https://github.com/octo/app/pull/5",
};
const PR_READ = { path: "repos/octo/app/pulls/5", stdout: JSON.stringify(PR) };
const PR_WRITE = { ...PR_READ, method: "PATCH" };
const CHECKS = {
  path: `repos/octo/app/commits/${SHA}/check-runs`,
  stdout: JSON.stringify({
    check_runs: [
      { name: "ci-status", status: "completed", conclusion: "success" },
      { name: "app-tests", status: "in_progress", conclusion: null },
    ],
  }),
};
const ISSUE = {
  number: 7,
  title: "chore(dev): something",
  state: "open",
  labels: [{ name: "enabler" }, { name: "epic:DEV" }],
  assignees: [{ login: "konradhe14" }],
  body: "Spec: US-DEV-13\n\nThe body text.",
  html_url: "https://github.com/octo/app/issues/7",
};
const ISSUE_READ = { path: "repos/octo/app/issues/7", stdout: JSON.stringify(ISSUE) };
const COMMENT = {
  path: "repos/octo/app/issues/7/comments",
  method: "POST",
  stdout: JSON.stringify({ html_url: "https://github.com/octo/app/issues/7#c1" }),
};

/** A folder with the fake gh; removed after the test, also when an assertion fails (#1297). */
function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), "rest-cli-1564-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "gh"), FAKE_GH, { mode: 0o755 });
  writeFileSync(join(dir, "package.json"), '{"type":"commonjs"}\n');
  return dir;
}

/** A file with the given text in the folder; its path. */
function bodyFile(dir, name, text) {
  const file = join(dir, name);
  writeFileSync(file, text);
  return file;
}

/** The gh calls logged by the fake gh in `log`, one array of arguments per call. */
function callsOf(log) {
  return existsSync(log)
    ? readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
}

/** Runs rest-cli.mjs with the fake gh as the only program on PATH; ENV holds the inputs. */
function cli(dir, command, env = {}, routes = []) {
  writeFileSync(join(dir, "routes.json"), JSON.stringify([...routes, REPO]));
  const log = join(dir, "calls.log");
  rmSync(log, { force: true });
  const res = spawnSync(process.execPath, [CLI, command], {
    encoding: "utf8",
    cwd: dir,
    env: { PATH: dir, FAKE_GH_LOG: log, FAKE_GH_ROUTES: join(dir, "routes.json"), ...env },
  });
  return { code: res.status, out: res.stdout, err: res.stderr, calls: callsOf(log) };
}

/**
 * Runs the real make target from the repository root with the fake gh first on PATH. The repository's idiom for shell
 * commands (`bash -c`, as in check-ci-drift.test.mjs): every value reaches bash through the environment (M_<NAME>) and is
 * quoted there, so the shell hands it to make byte for byte and never parses it. VARS are make command-line values.
 */
function make(dir, target, vars, routes = [], flags = "-s") {
  writeFileSync(join(dir, "routes.json"), JSON.stringify([...routes, REPO]));
  const log = join(dir, "calls.log");
  rmSync(log, { force: true });
  const names = Object.keys(vars);
  const command = [`make ${flags} ${target}`, ...names.map((k) => `${k}="$M_${k}"`)].join(" ");
  const res = spawnSync("bash", ["-c", command], {
    encoding: "utf8",
    cwd: fileURLToPath(ROOT),
    env: {
      PATH: `${dir}:${dirname(process.execPath)}:${process.env.PATH}`,
      FAKE_GH_LOG: log,
      FAKE_GH_ROUTES: join(dir, "routes.json"),
      ...Object.fromEntries(names.map((k) => [`M_${k}`, vars[k]])),
    },
  });
  return { code: res.status, out: res.stdout, err: res.stderr, calls: callsOf(log) };
}

test("US-DEV-13 pr-state prints title, state, draft, merged, head, base, auto-merge and the checks of the head", (t) => {
  const r = cli(scratch(t), "pr-state", { REST_PR: "5" }, [PR_READ, CHECKS]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^PR #5 "feat\(acc\): sign in \(US-ACC-01\)"/);
  for (const line of [
    "state: open",
    "draft: yes",
    "merged: no",
    `head: ${SHA}`,
    "base: dev",
    "auto-merge: off",
    "ci-status: success",
    "app-tests: in_progress",
  ]) {
    assert.ok(r.out.split("\n").includes(`  ${line}`) || r.out.includes(line), line);
  }
});

test("US-DEV-13 pr-state reads the latest run of each check and says auto-merge is on when it is enabled", (t) => {
  const pr = { ...PR, merged: true, state: "closed", auto_merge: { merge_method: "squash" } };
  const route = { ...PR_READ, stdout: JSON.stringify(pr) };
  const r = cli(scratch(t), "pr-state", { REST_PR: "5" }, [route, CHECKS]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /merged: yes/);
  assert.match(r.out, /auto-merge: on/);
  assert.ok(
    r.calls.some((c) => c.some((a) => a.includes("check-runs?filter=latest"))),
    "the checks are read with filter=latest",
  );
});

test("US-DEV-13 pr-state says so when the head has no check runs", (t) => {
  const empty = { ...CHECKS, stdout: JSON.stringify({ check_runs: [] }) };
  const r = cli(scratch(t), "pr-state", { REST_PR: "5" }, [PR_READ, empty]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /checks of the head: none/);
});

test("US-DEV-13 issue-read prints title, state, labels, assignees and the body of the issue", (t) => {
  const r = cli(scratch(t), "issue-read", { REST_ISSUE: "7" }, [ISSUE_READ]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^ISSUE #7 "chore\(dev\): something"/m);
  assert.match(r.out, /state: open/);
  assert.match(r.out, /labels: enabler, epic:DEV/);
  assert.match(r.out, /assignees: konradhe14/);
  assert.match(r.out, /The body text\./);
});

test("US-DEV-13 issue-read refuses a pull request number and names make pr-state", (t) => {
  const asPr = { ...ISSUE, number: 5, pull_request: { url: "https://api.github.com/x" } };
  const route = { path: "repos/octo/app/issues/5", stdout: JSON.stringify(asPr) };
  const r = cli(scratch(t), "issue-read", { REST_ISSUE: "5" }, [route]);
  assert.equal(r.code, 2);
  assert.match(r.err, /make pr-state PR=5/);
});

test("US-DEV-13 pr-text sets the title and the body over REST, the body sent from its file", (t) => {
  const dir = scratch(t);
  const file = bodyFile(dir, "pr.md", "## Summary\n\nText with `code` and = signs\n");
  const r = cli(
    dir,
    "pr-text",
    { REST_PR: "5", REST_TITLE: "feat(acc): new title", REST_BODY: file },
    [PR_WRITE],
  );
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /PR #5 title and body set/);
  const write = r.calls.find((c) => c.includes("PATCH"));
  assert.deepEqual(write, [
    "api",
    "-X",
    "PATCH",
    "repos/octo/app/pulls/5",
    "-f",
    "title=feat(acc): new title",
    "-F",
    `body=@${file}`,
  ]);
});

test("US-DEV-13 pr-text without a title changes only the body", (t) => {
  const dir = scratch(t);
  const file = bodyFile(dir, "pr.md", "Only the body\n");
  const r = cli(dir, "pr-text", { REST_PR: "5", REST_BODY: file }, [PR_WRITE]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /PR #5 body set/);
  const write = r.calls.find((c) => c.includes("PATCH"));
  assert.deepEqual(write, ["api", "-X", "PATCH", "repos/octo/app/pulls/5", "-F", `body=@${file}`]);
});

test("US-DEV-13 pr-text refuses a missing, empty or blank body file and sends nothing", (t) => {
  const dir = scratch(t);
  const cases = [
    ["missing", { REST_PR: "5", REST_BODY: join(dir, "nope.md") }],
    ["empty", { REST_PR: "5", REST_BODY: bodyFile(dir, "empty.md", "") }],
    ["blank", { REST_PR: "5", REST_BODY: bodyFile(dir, "blank.md", "  \n\n") }],
    ["no BODY at all", { REST_PR: "5" }],
  ];
  for (const [name, env] of cases) {
    const r = cli(dir, "pr-text", env, [PR_WRITE]);
    assert.equal(r.code, 2, name);
    assert.deepEqual(r.calls, [], `${name}: no gh call at all`);
  }
});

test("US-DEV-13 issue-comment adds the body file as a comment over REST", (t) => {
  const dir = scratch(t);
  const file = bodyFile(dir, "comment.md", "A comment\n");
  const r = cli(dir, "issue-comment", { REST_ISSUE: "7", REST_BODY: file }, [COMMENT]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /comment added to #7: https:\/\/github\.com\/octo\/app\/issues\/7#c1/);
  const write = r.calls.find((c) => c.includes("POST"));
  assert.deepEqual(write, [
    "api",
    "-X",
    "POST",
    "repos/octo/app/issues/7/comments",
    "-F",
    `body=@${file}`,
  ]);
});

test("US-DEV-13 issue-comment refuses a missing or empty body file and sends nothing", (t) => {
  const dir = scratch(t);
  for (const [name, file] of [
    ["missing", join(dir, "nope.md")],
    ["empty", bodyFile(dir, "empty.md", "")],
  ]) {
    const r = cli(dir, "issue-comment", { REST_ISSUE: "7", REST_BODY: file }, [COMMENT]);
    assert.equal(r.code, 2, name);
    assert.deepEqual(r.calls, [], `${name}: no gh call at all`);
  }
});

test("US-DEV-13 the four commands refuse a number that is not a positive whole number before any call", (t) => {
  const dir = scratch(t);
  const file = bodyFile(dir, "text.md", "Text\n");
  const routes = [PR_WRITE, ISSUE_READ, COMMENT, PR_READ, CHECKS];
  const commands = [
    ["pr-state", "REST_PR", {}],
    ["issue-read", "REST_ISSUE", {}],
    ["pr-text", "REST_PR", { REST_BODY: file }],
    ["issue-comment", "REST_ISSUE", { REST_BODY: file }],
  ];
  for (const [command, key, extra] of commands) {
    for (const bad of ["", "0", "-3", "abc", "1.5", "5x"]) {
      const r = cli(dir, command, { ...extra, [key]: bad }, routes);
      assert.equal(r.code, 2, `${command} ${JSON.stringify(bad)}`);
      assert.match(r.err, /positive number/, command);
      assert.deepEqual(r.calls, [], `${command} ${JSON.stringify(bad)}: no gh call`);
    }
    const none = cli(dir, command, extra, routes);
    assert.equal(none.code, 2, `${command} without a number`);
    assert.deepEqual(none.calls, [], `${command} without a number: no gh call`);
  }
});

test("US-DEV-13 the commands use gh api over REST only: no gh pr, no gh issue, no GraphQL", (t) => {
  const dir = scratch(t);
  const file = bodyFile(dir, "text.md", "Text\n");
  const runs = [
    cli(dir, "pr-state", { REST_PR: "5" }, [PR_READ, CHECKS]),
    cli(dir, "issue-read", { REST_ISSUE: "7" }, [ISSUE_READ]),
    cli(dir, "pr-text", { REST_PR: "5", REST_TITLE: "x", REST_BODY: file }, [PR_WRITE]),
    cli(dir, "issue-comment", { REST_ISSUE: "7", REST_BODY: file }, [COMMENT]),
  ];
  for (const r of runs) {
    assert.equal(r.code, 0, r.err);
    assert.ok(r.calls.length > 0, "the command made gh calls");
    for (const args of r.calls) {
      assert.equal(args[0], "api", args.join(" "));
      assert.ok(!args.includes("graphql"), args.join(" "));
      assert.ok(
        args.every((a) => !/^(pr|issue)$/.test(a)),
        args.join(" "),
      );
    }
  }
});

test("US-DEV-13 a failed read or write exits 1 and says that GitHub failed", (t) => {
  const dir = scratch(t);
  const missing = {
    path: "repos/octo/app/pulls/5",
    code: 1,
    stderr: "gh: Not Found (HTTP 404)",
  };
  const read = cli(dir, "pr-state", { REST_PR: "5" }, [missing]);
  assert.equal(read.code, 1);
  assert.match(read.err, /GitHub call failed/);
  assert.match(read.err, /HTTP 404/);

  const file = bodyFile(dir, "text.md", "Text\n");
  const refused = { ...PR_WRITE, code: 1, stderr: "gh: Validation Failed (HTTP 422)" };
  const write = cli(dir, "pr-text", { REST_PR: "5", REST_BODY: file }, [refused]);
  assert.equal(write.code, 1);
  assert.match(write.err, /HTTP 422/);
});

test("US-DEV-13 the four targets are in .PHONY, have a help sentence and their recipe runs rest-cli.mjs and nothing else", () => {
  const lines = readFileSync(new URL("Makefile", ROOT), "utf8").split("\n");
  const phony = lines.find((l) => l.startsWith(".PHONY:")).split(/\s+/);
  for (const name of ["pr-state", "issue-read", "pr-text", "issue-comment"]) {
    assert.ok(phony.includes(name), `${name} is not in .PHONY`);
    const at = lines.findIndex((l) => l.startsWith(`${name}:`));
    assert.ok(at >= 0, `${name} has no target line`);
    assert.ok(lines[at].split("## ")[1]?.trim(), `${name} has no help sentence after ##`);
    assert.equal(
      lines[at + 1],
      `\tnode $(APP)/tools/workflow/actions/issue/rest-cli.mjs ${name}`,
      `${name} recipe`,
    );
  }
});

test("US-DEV-13 the Makefile passes the inputs as raw command-line values, so make expands no user text", () => {
  const lines = readFileSync(new URL("Makefile", ROOT), "utf8").split("\n");
  for (const v of ["PR", "ISSUE", "TITLE", "BODY"]) {
    assert.ok(lines.includes(`export REST_${v} := $(value ${v})`), `REST_${v} is not exported raw`);
  }
  const recipes = lines.filter((l) => /rest-cli\.mjs (pr-|issue-)/.test(l));
  assert.equal(recipes.length, 4);
  for (const recipe of recipes)
    assert.doesNotMatch(recipe, /\$\((PR|ISSUE|TITLE|BODY)\)|["`]/, recipe);
});

test("US-DEV-13 .claude/settings.json allows the seven read and write targets and no gh api or sed -i", () => {
  const settings = JSON.parse(readFileSync(new URL(".claude/settings.json", ROOT), "utf8"));
  const allow = settings.permissions.allow;
  for (const rule of [
    "Bash(grep:*)",
    "Bash(rg:*)",
    "Bash(sed -n:*)",
    "Bash(make pr-state PR=*)",
    "Bash(make issue-read ISSUE=*)",
    "Bash(make pr-text PR=*)",
    "Bash(make issue-comment ISSUE=*)",
  ]) {
    assert.ok(allow.includes(rule), `${rule} is not allowed`);
  }
  assert.equal(new Set(allow).size, allow.length, "a rule is listed twice");
  assert.ok(!allow.some((r) => /gh api|sed -i|sed:\*/.test(r)), "gh api or sed -i is allowed");
  assert.ok(settings.permissions.deny.includes("Bash(gh pr merge:*)"), "deny rule missing");
});

test("US-DEV-13 make pr-text sends a title with backticks and $(...) to gh unchanged and runs nothing", (t) => {
  const dir = scratch(t);
  const file = bodyFile(dir, "pr.md", "Text\n");
  const marker = join(dir, "touched-by-title");
  const title = `a \`touch ${marker}\` b $(touch ${marker}) c`;
  const r = make(dir, "pr-text", { PR: "5", TITLE: title, BODY: file }, [PR_WRITE]);
  assert.equal(existsSync(marker), false, "the title was run as a shell command");
  assert.equal(r.code, 0, r.err);
  const write = r.calls.find((c) => c.includes("PATCH"));
  assert.ok(
    write?.includes(`title=${title}`),
    `gh did not get the title unchanged: ${JSON.stringify(write)}`,
  );
});

test("US-DEV-13 make refuses a PR number with a backtick before any call and runs nothing", (t) => {
  const dir = scratch(t);
  const marker = join(dir, "touched-by-number");
  const r = make(dir, "pr-state", { PR: `5\`touch ${marker}\`` }, [PR_READ]);
  assert.equal(existsSync(marker), false, "the number was run as a shell command");
  assert.equal(r.code, 2, r.err);
  assert.deepEqual(r.calls, []);
});

test("US-DEV-13 make reads a body file whose name holds backticks under that exact name", (t) => {
  const dir = scratch(t);
  const file = bodyFile(dir, "body-`echo ok`-end.md", "Text\n");
  const r = make(dir, "pr-text", { PR: "5", TITLE: "x", BODY: file }, [PR_WRITE]);
  assert.equal(r.code, 0, r.err);
  const write = r.calls.find((c) => c.includes("PATCH"));
  assert.ok(
    write?.includes(`body=@${file}`),
    `gh did not get the body path unchanged: ${JSON.stringify(write)}`,
  );
});

test("US-DEV-13 auto-merge is declared in .PHONY, has a help sentence and runs ci-wait, then merge-pr, joined by &&", () => {
  const lines = readFileSync(new URL("Makefile", ROOT), "utf8").split("\n");
  const phony = lines.find((l) => l.startsWith(".PHONY:")).split(/\s+/);
  assert.ok(phony.includes("auto-merge"), "auto-merge is not in .PHONY");
  const at = lines.findIndex((l) => l.startsWith("auto-merge:"));
  assert.ok(at >= 0, "auto-merge has no target line");
  assert.ok(lines[at].split("## ")[1]?.trim(), "auto-merge has no help sentence after ##");
  assert.equal(
    lines[at + 1],
    '\tcd $(APP) && node tools/workflow/actions/ci-reuse/ci-wait.mjs "$$REST_PR" && node tools/workflow/merge-pr.mjs "$$REST_PR"',
  );
  assert.doesNotMatch(lines[at + 1], /\$\(PR\)/, "the recipe reads the number through make");
});

test("US-DEV-13 make -n auto-merge prints the number only as $REST_PR, so user text never reaches the command", (t) => {
  const dir = scratch(t);
  const marker = join(dir, "touched-by-auto-merge");
  const r = make(dir, "auto-merge", { PR: `1;touch ${marker}` }, [], "-n");
  assert.equal(r.code, 0, r.err);
  assert.equal(existsSync(marker), false, "the number was run as a shell command");
  assert.ok(!r.out.includes(marker) && !r.out.includes("1;"), r.out);
  assert.match(
    r.out,
    /ci-wait\.mjs "\$REST_PR" && node tools\/workflow\/merge-pr\.mjs "\$REST_PR"/,
  );
});

test("US-DEV-13 auto-merge refuses a value that is not a whole number before any call and never reaches merge-pr", (t) => {
  const dir = scratch(t);
  const marker = join(dir, "touched-by-auto-merge");
  for (const bad of ["", "abc", "5x", "-3", "1.5", `1;touch ${marker}`]) {
    const r = make(dir, "auto-merge", { PR: bad }, [PR_READ, PR_WRITE, CHECKS]);
    assert.equal(r.code, 2, JSON.stringify(bad));
    assert.match(r.err, /usage: make ci-wait PR=<number>/, JSON.stringify(bad));
    assert.doesNotMatch(r.err, /usage: make merge/, `${JSON.stringify(bad)}: merge-pr ran`);
    assert.deepEqual(r.calls, [], `${JSON.stringify(bad)}: no gh call at all`);
  }
  assert.equal(existsSync(marker), false, "the value was run as a shell command");
});

test("US-DEV-02 .claude/settings.json denies sed -i and rg --pre, and allows make auto-merge for a PR number", () => {
  const settings = JSON.parse(readFileSync(new URL(".claude/settings.json", ROOT), "utf8"));
  for (const rule of ["Bash(sed -n -i:*)", "Bash(rg --pre:*)"]) {
    assert.ok(settings.permissions.deny.includes(rule), `${rule} is not denied`);
  }
  assert.ok(
    settings.permissions.allow.includes("Bash(make auto-merge PR=*)"),
    "make auto-merge is not allowed",
  );
});
