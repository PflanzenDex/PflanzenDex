// The Makefile side of the four targets of US-DEV-01 (db-reset, db-seed, pokedex-build, clean-ports): each exists with a help
// sentence and is declared in .PHONY, the local-only guard runs before any database change, and db-down removes the volume.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const makefile = readFileSync(new URL("../../../../Makefile", import.meta.url), "utf8");
const lines = makefile.split("\n");
const TARGETS = ["db-reset", "db-seed", "pokedex-build", "clean-ports"];

// The recipe lines of a target: the tab-indented lines after `name:` up to the next line that is not indented.
function recipeOf(name) {
  const start = lines.findIndex((l) => l.startsWith(`${name}:`));
  assert.ok(start >= 0, `target ${name} is missing in the Makefile`);
  const body = [];
  for (let i = start + 1; i < lines.length && lines[i].startsWith("\t"); i++) body.push(lines[i]);
  return body.join("\n");
}

test("US-DEV-01 the four targets exist, are declared in .PHONY and have a help sentence", () => {
  const phony = lines.find((l) => l.startsWith(".PHONY:")).split(/\s+/);
  for (const name of TARGETS) {
    assert.ok(phony.includes(name), `${name} is not in .PHONY`);
    const header = lines.find((l) => l.startsWith(`${name}:`));
    assert.ok(header, `${name} has no target line`);
    assert.ok(header.split("## ")[1]?.trim(), `${name} has no help sentence after ##`);
  }
});

test("US-DEV-01 db-down removes the test database with its volume, so a reset starts empty", () => {
  assert.match(recipeOf("db-down"), /docker rm -f -v \$\(DB_CONTAINER\)/);
});

test("US-DEV-01 db-reset checks the database before it removes anything", () => {
  const recipe = recipeOf("db-reset");
  const guard = recipe.indexOf("local-database.mjs");
  assert.ok(guard >= 0, "db-reset does not run the local-only guard");
  for (const change of ["db-down", "db-up", "migrate"]) {
    const at = recipe.indexOf(change);
    assert.ok(at > guard, `${change} runs before the guard`);
  }
});

test("US-DEV-01 db-seed and pokedex-build check the database before they write to it", () => {
  for (const name of ["db-seed", "pokedex-build"]) {
    const recipe = recipeOf(name);
    const guard = recipe.indexOf("local-database.mjs");
    assert.ok(guard >= 0, `${name} does not run the local-only guard`);
    const write = recipe.search(/seed:demo|taxonomy:build|npm run migrate/);
    assert.ok(write > guard, `${name} writes before the guard`);
  }
});

test("US-DEV-01 the local-only targets name this worktree's database, not a value taken from another checkout", () => {
  for (const name of ["db-reset", "db-seed", "pokedex-build"]) {
    assert.match(recipeOf(name), /local-database\.mjs \$\(PFLANZENDEX_TEST_DATABASE_URL\)/, name);
  }
});

// The Makefile run for real (US-DEV-13, issue 1636): `make` runs first with fake tools on the PATH. Each fake records its
// arguments (NUL separated), its environment and its stdin in a folder of the test, numbered in the order of the calls, and
// exits 0. The recipes run in a real shell, so a value that a shell would execute stays text, and a tool gets exactly the
// arguments of its recipe. `extra` is shell code that runs before the exit (docker: `start` decides a new or a reused container).
const fakeTool = (extra = "") => `#!/bin/sh
# The number is taken under a lock (mkdir is atomic): the suites of ci-tests-base run at once (US-QG-02, issue 1698).
while ! mkdir "$RECORD_DIR/lock" 2>/dev/null; do :; done
n=$(cat "$RECORD_DIR/seq" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$RECORD_DIR/seq"
rmdir "$RECORD_DIR/lock"
rec="$RECORD_DIR/$(printf '%04d' "$n")-$(basename "$0")"
{ for a in "$@"; do printf '%s\\0' "$a"; done; } > "$rec.args"
env > "$rec.env"
cat > "$rec.stdin"
${extra}
exit 0
`;
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

// Runs `make --no-print-directory -C <root> <args>` with the fakes on the PATH; `docker` adds a fake docker, `new` when its
// `start` fails (the container is created) and `reused` when it succeeds (docker start reuses the container).
function makeRun(t, args, { env = {}, docker = null, dockerShell = null, npm = "" } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "make-values-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, "bin");
  const record = path.join(dir, "record");
  mkdirSync(bin);
  mkdirSync(record);
  // `npm` is shell code for the fake npm (for one run that must fail, e.g. a failed one-screen gate).
  const tools = { node: fakeTool(), npm: fakeTool(npm), npx: fakeTool() };
  if (docker === "new") tools.docker = fakeTool('case "$1" in start) exit 1 ;; esac');
  if (docker === "reused") tools.docker = fakeTool('case "$1" in start) exit 0 ;; esac');
  // `dockerShell` is shell code for a fake docker that answers by subcommand (ci-db-tune: `ps`, `show fsync`).
  if (dockerShell !== null) tools.docker = fakeTool(dockerShell);
  for (const [name, text] of Object.entries(tools))
    writeFileSync(path.join(bin, name), text, { mode: 0o755 });
  // MAKEFLAGS, MAKELEVEL and MFLAGS come from an outer make; CI and FRESH are set only where a test says so (a FRESH of the
  // caller's shell, as in `FRESH=1 make ci`, would otherwise reach every run).
  const outer = ["MAKEFLAGS", "MAKELEVEL", "MFLAGS", "CI", "FRESH"];
  const base = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !outer.includes(name)),
  );
  const result = spawnSync("make", ["--no-print-directory", "-C", ROOT, ...args], {
    encoding: "utf8",
    input: "",
    env: {
      ...base,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      RECORD_DIR: record,
      ...env,
    },
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}`, record };
}

const envOf = (text) =>
  Object.fromEntries(
    text
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );

// Every call of a fake tool in a run, in the order of the calls: its name, arguments, environment and stdin.
function calls(run) {
  return readdirSync(run.record)
    .filter((file) => file.endsWith(".args"))
    .sort()
    .map((file) => {
      const base = file.slice(0, -".args".length);
      return {
        tool: base.replace(/^\d+-/, ""),
        args: readFileSync(path.join(run.record, file), "utf8").split("\0").slice(0, -1),
        env: envOf(readFileSync(path.join(run.record, `${base}.env`), "utf8")),
        stdin: readFileSync(path.join(run.record, `${base}.stdin`), "utf8"),
      };
    });
}

// The one call whose arguments contain `needle` (`issue-cli.mjs`, `one-screen`, ...); any other count fails the test.
function callOf(run, needle) {
  const found = calls(run).filter((call) => call.args.some((arg) => arg.includes(needle)));
  assert.equal(found.length, 1, `expected one call with ${needle}, got ${found.length}`);
  return found[0];
}

// A folder with a marker file path for a payload: `touch <file>` in a value creates the file if the value runs.
function markerIn(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "make-marker-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "marker");
  return { file, ran: () => existsSync(file) };
}

test("US-DEV-13 a value of the command line reaches its tool as text: a $(...), a quote or a backtick in it runs nothing", (t) => {
  for (const template of ["x$(shell touch MARKER)", 'a"; touch MARKER; "', "b`touch MARKER`"]) {
    const marker = markerIn(t);
    const value = template.replaceAll("MARKER", marker.file);
    const cases = [
      [
        [
          "issue",
          "TYPE=story",
          "EPIC=QS",
          "PRIORITY=P1",
          `TITLE=${value}`,
          "RELEASE=R2",
          `BODY=${value}`,
        ],
        "issue-cli.mjs",
      ],
      [["claim", `ISSUE=${value}`], "claim.mjs"],
      [["merge", `PR=${value}`], "merge-pr.mjs"],
      [["board", `RELEASE=${value}`], "board.mjs"],
      [["news-release", `VERSION=${value}`], "news-release.mjs"],
      [["migration", `NAME=${value}`], "new-migration.mjs"],
    ];
    for (const [args, needle] of cases) {
      const result = makeRun(t, args);
      assert.equal(result.status, 0, `make ${args[0]}: ${result.out}`);
      assert.equal(
        callOf(result, needle).args.includes(value),
        true,
        `make ${args[0]} gives the value unchanged`,
      );
      assert.equal(marker.ran(), false, `make ${args[0]} ran the value ${template}`);
    }
    const commit = makeRun(t, ["commitlint", `MSG=${value}`]);
    assert.equal(commit.status, 0, commit.out);
    assert.equal(
      callOf(commit, "commitlint").stdin.trim(),
      value,
      "commitlint gets the message unchanged",
    );
    assert.equal(marker.ran(), false, `commitlint ran the message ${template}`);
  }
});

test("US-DEV-13 a value of the job list, the layout options or the branch runs nothing either", (t) => {
  const marker = markerIn(t);
  const value = `x$(shell touch ${marker.file})`;
  assert.equal(makeRun(t, ["ci-reuse", `JOBS=${value}`]).status, 0);
  assert.equal(makeRun(t, ["layout-fix", "DIR=app/x", `ARGS=${value}`]).status, 0);
  assert.equal(makeRun(t, ["crap", `ARGS=${value}`]).status, 0);
  // With -n only the recipe is printed, but make runs a $(shell) while it expands the recipe, so the marker shows that too.
  const branch = makeRun(t, ["-n", "worktree", `BRANCH=${value}`]);
  assert.equal(branch.status, 0, branch.out);
  assert.match(branch.out, /tools\/repo\/worktree-new\.sh "\$RAW_BRANCH"/);
  assert.equal(marker.ran(), false, "a value ran a command");
});

// US-QG-01 (owner decision 2026-11-07): the UI gates of CI run once per shard. ui-gates seeds the demo once, then runs
// one-screen and a11y-routes on the same shard in one Playwright run (US-QG-02, issue 1698): both projects, no early stop, so a
// failed one-screen test does not stop a11y-routes, and the run fails.
test("US-QG-01 the UI gates run once per shard: one seed, then one-screen and a11y-routes on the same shard", (t) => {
  const prerequisites = ["-o", "db-up", "-o", "auth-up", "-o", "migrate", "-o", "browsers"];
  const args = [...prerequisites, "ui-gates", "SHARD=2/4", "-j3", "-Otarget"];
  const run = makeRun(t, args, { env: { CI: "1" } });
  assert.equal(run.status, 0, run.out);
  const npm = calls(run).filter((call) => call.tool === "npm");
  assert.deepEqual(
    npm.map((call) => call.args[1]),
    ["seed:demo", "ui-gates"],
    "one seed, then one run of both gates",
  );
  assert.equal(npm[1].env.ONE_SCREEN_SHARD, "2/4");
  assert.equal(npm[1].env.A11Y_ROUTES_SHARD, "2/4");
  assert.equal(npm[1].env.TAXONOMY_BUILD, "off");

  // The one run holds both gate projects and never stops early, so a11y-routes runs and is judged after one-screen failed.
  const e2e = JSON.parse(
    readFileSync(new URL("../../../packages/e2e/package.json", import.meta.url), "utf8"),
  );
  const script = e2e.scripts["ui-gates"];
  assert.match(script, /--project=one-screen\b/);
  assert.match(script, /--project=a11y-routes\b/);
  assert.doesNotMatch(
    script,
    /--max-failures|\s-x\b|--pass-with-no-tests|--last-failed|--only-changed/,
  );
  assert.match(
    script,
    /E2E_WEB_BUILD=1/,
    "the gates run against the production build (issue 1680)",
  );

  const failing = makeRun(t, args, {
    env: { CI: "1" },
    npm: 'case "$2" in ui-gates) exit 1 ;; esac',
  });
  assert.notEqual(failing.status, 0, failing.out);
});

test("US-QG-01 ui-gates refuses SCREEN, with or without SHARD: one screen is make one-screen", (t) => {
  const prerequisites = ["-o", "db-up", "-o", "auth-up", "-o", "migrate", "-o", "browsers"];
  // The guards of a rule are read only when that rule is the goal (issue 1713): SCREEN is refused by the ui-gates guard with or
  // without SHARD, and SCREEN with SHARD by the guard of the one-screen rule, when one-screen is the goal.
  const refusals = [
    ["ui-gates", ["SCREEN=today"], /ui-gates: SCREEN measures one screen/],
    ["ui-gates", ["SCREEN=today", "SHARD=1/4"], /ui-gates: SCREEN measures one screen/],
    [
      "one-screen",
      ["SCREEN=today", "SHARD=1/4"],
      /one-screen: SCREEN cannot be combined with SHARD/,
    ],
  ];
  for (const [target, extra, message] of refusals) {
    const run = makeRun(t, [...prerequisites, target, ...extra], { env: { CI: "1" } });
    assert.notEqual(run.status, 0, `${target} ${extra.join(" ")}`);
    assert.match(run.out, message);
    assert.equal(calls(run).length, 0, "nothing ran");
  }
});

// `make -n` from the top of the repo: it prints the recipes and runs none. CI=1 leaves out the database start (issue 1713).
function dryRun(args) {
  const outer = ["MAKEFLAGS", "MAKELEVEL", "MFLAGS", "CI", "FRESH"];
  const base = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !outer.includes(name)),
  );
  const result = spawnSync("make", ["--no-print-directory", "-n", "-C", ROOT, ...args], {
    encoding: "utf8",
    input: "",
    env: { ...base, CI: "1" },
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

test("US-QG-02 make one-screen SCREEN=<id> passes the ui-gates guard (issue 1713)", () => {
  const run = dryRun(["one-screen", "SCREEN=x"]);
  assert.equal(run.status, 0, run.err);
  assert.doesNotMatch(`${run.out}${run.err}`, /ui-gates: SCREEN/);
});

test("US-QG-02 make ui-gates SCREEN=<id> is still refused before anything starts, with or without SHARD (issue 1713)", () => {
  for (const args of [
    ["ui-gates", "SCREEN=x"],
    ["ui-gates", "SHARD=1/5", "SCREEN=x"],
  ]) {
    const run = dryRun(args);
    assert.notEqual(run.status, 0, args.join(" "));
    assert.match(run.err, /ui-gates: SCREEN measures one screen/);
    assert.equal(run.out, "", "no recipe is printed: the refusal comes at parse time");
  }
});

test("US-QG-02 make one-screen SCREEN=<id> keeps its own guards against SHARD and ONE_SCREEN_WRITE=1 (issue 1713)", () => {
  for (const [args, message] of [
    [["one-screen", "SCREEN=x", "SHARD=1/2"], /one-screen: SCREEN cannot be combined with SHARD/],
    [
      ["one-screen", "SCREEN=x", "ONE_SCREEN_WRITE=1"],
      /one-screen: SCREEN cannot be combined with ONE_SCREEN_WRITE=1/,
    ],
  ]) {
    const run = dryRun(args);
    assert.notEqual(run.status, 0, args.join(" "));
    assert.match(run.err, message);
  }
});

test("US-QG-02 make help with SCREEN and SHARD does not stop on the one-screen guards (issue 1713)", () => {
  const run = dryRun(["help", "SCREEN=x", "SHARD=1/2"]);
  assert.equal(run.status, 0, run.err);
});

test("US-DEV-13 the CI forms still run the same commands: one-screen and a11y-routes take the shard, ci-reuse the job list", (t) => {
  const prerequisites = ["-o", "db-up", "-o", "auth-up", "-o", "migrate", "-o", "browsers"];
  for (const target of ["one-screen", "a11y-routes"]) {
    const run = makeRun(t, [...prerequisites, target, "SHARD=1/3", "-j3", "-Otarget"], {
      env: { CI: "1" },
    });
    assert.equal(run.status, 0, run.out);
    const call = callOf(run, target);
    assert.deepEqual(call.args, ["run", target]);
    assert.equal(
      call.env[target === "one-screen" ? "ONE_SCREEN_SHARD" : "A11Y_ROUTES_SHARD"],
      "1/3",
    );
    assert.equal(call.env.TAXONOMY_BUILD, "off");
  }
  const jobs = [
    "app-gates",
    "app-tests",
    "app-tests-web",
    "results",
    "app-ui",
    "ds-snapshots",
    "lighthouse",
  ];
  const reuse = makeRun(t, ["ci-reuse", `JOBS=${jobs.join(" ")}`]);
  assert.deepEqual(callOf(reuse, "ci-reuse.mjs").args.slice(1), jobs);
});

test("US-DEV-13 the optional values keep their guards: --release only with RELEASE, --write only with WRITE, --apply only with APPLY", (t) => {
  const issue = ["issue", "TYPE=story", "EPIC=QS", "PRIORITY=P1", "TITLE=hi", "BODY=README.md"];
  assert.equal(callOf(makeRun(t, issue), "issue-cli.mjs").args.includes("--release"), false);
  const released = callOf(makeRun(t, [...issue, "RELEASE=R2"]), "issue-cli.mjs").args;
  assert.deepEqual(released.slice(-2), ["--release", "R2"]);
  assert.equal(
    callOf(makeRun(t, ["retro", "WRITE=1"]), "retro.mjs").args.includes("--write"),
    true,
  );
  assert.equal(callOf(makeRun(t, ["retro"]), "retro.mjs").args.includes("--write"), false);
  const layout = callOf(
    makeRun(t, ["layout-fix", "DIR=app/x", "APPLY=1", "ARGS=--move a=b"]),
    "layout-fix.mjs",
  ).args;
  assert.deepEqual(layout.slice(-4), ["app/x", "--apply", "--move", "a=b"]);
});

test("US-QG-02 db-up sets fsync, synchronous_commit and full_page_writes off after the database answers, new or reused container (issue 1636)", (t) => {
  const offStatements = [
    "alter system set fsync = off",
    "alter system set synchronous_commit = off",
    "alter system set full_page_writes = off",
    "select pg_reload_conf()",
  ];
  const memoryOf = (args) => args.slice(args.indexOf("--memory"), args.indexOf("--memory") + 2)[1];

  const created = makeRun(t, ["db-up", "DB_MEMORY=1g"], { docker: "new" });
  assert.equal(created.status, 0, created.out);
  const dockerCalls = calls(created).filter((call) => call.tool === "docker");
  const run = dockerCalls.find((call) => call.args[0] === "run");
  assert.equal(memoryOf(run.args), "1g", "the memory cap is the given value");
  const ready = dockerCalls.findIndex((call) => call.args.includes("pg_isready"));
  const settings = dockerCalls.findIndex((call) => call.args.includes("psql"));
  assert.ok(ready >= 0 && settings > ready, "the settings come after the readiness check");
  for (const statement of offStatements)
    assert.ok(dockerCalls[settings].args.includes(statement), statement);

  const reused = makeRun(t, ["db-up"], { docker: "reused" });
  assert.equal(reused.status, 0, reused.out);
  const reusedCalls = calls(reused).filter((call) => call.tool === "docker");
  assert.equal(
    reusedCalls.some((call) => call.args[0] === "run"),
    false,
    "a reused container is not created again",
  );
  const reusedSettings = reusedCalls.find((call) => call.args.includes("psql"));
  for (const statement of offStatements)
    assert.ok(reusedSettings.args.includes(statement), statement);
});

// A fake docker for ci-db-tune: `ps` prints the container ids (space-separated, none for ""), `show fsync` prints `fsync`.
const ciDocker = (ids, fsync) =>
  `case "$1" in ps) printf '%s\\n' ${ids} ;; esac\ncase "$*" in *"show fsync"*) echo ${fsync} ;; esac`;

test("US-QG-02 ci-db-tune sets fsync, synchronous_commit and full_page_writes off on the one Postgres service of the CI job (issue 1698)", (t) => {
  const offStatements = [
    "alter system set fsync = off",
    "alter system set synchronous_commit = off",
    "alter system set full_page_writes = off",
    "select pg_reload_conf()",
  ];

  const one = makeRun(t, ["ci-db-tune"], { dockerShell: ciDocker("abc123", "off") });
  assert.equal(one.status, 0, one.out);
  assert.match(one.out, /ci-db-tune: fsync, synchronous_commit and full_page_writes off/);
  const execs = calls(one).filter((call) => call.tool === "docker" && call.args[0] === "exec");
  for (const call of execs)
    assert.equal(call.args[1], "abc123", "every exec goes to the one service container");
  const settings = execs.find((call) => call.args.includes(offStatements[0]));
  assert.ok(settings, "the alter system statements run in the container");
  for (const statement of offStatements) assert.ok(settings.args.includes(statement), statement);
  assert.ok(
    execs.some((call) => call.args.includes("show fsync")),
    "the setting is read back",
  );

  const none = makeRun(t, ["ci-db-tune"], { dockerShell: ciDocker("", "off") });
  assert.notEqual(none.status, 0, "no container is an error");
  assert.match(none.out, /expected one container that publishes port \S+, found 0/);
  assert.equal(
    calls(none).some((call) => call.tool === "docker" && call.args[0] === "exec"),
    false,
    "nothing runs when no container is found",
  );

  const stuck = makeRun(t, ["ci-db-tune"], { dockerShell: ciDocker("abc123", "on") });
  assert.notEqual(stuck.status, 0, "a database that still reports fsync on is an error");
  assert.match(stuck.out, /does not report fsync off after 10 checks/);
});

test("US-QG-02 make ci has no prerequisite that could stop the parts runner, and the CI targets keep theirs", (t) => {
  const ci = makeRun(t, ["-n", "ci"]);
  assert.equal(ci.out.trim(), "cd app && npm run ci");
  const ciGates = makeRun(t, ["-n", "ci-gates"]);
  assert.match(ciGates.out, /gitleaks\.sh/);
  assert.match(ciGates.out, /actionlint\.sh/);
  assert.match(ciGates.out, /npm run ci:gates/);
  const help = makeRun(t, ["help"]);
  assert.match(help.out, /ci {2,}All parts of the local CI in order .*exit 1 when one failed/);
});

test("US-DEV-13 FRESH reaches npm run gates as the environment variable: set when given (also empty), unset when not, never expanded", (t) => {
  const gates = (args) => makeRun(t, ["-o", "secrets", "-o", "workflows", "gates", ...args]);
  assert.equal(callOf(gates([]), "gates").env.FRESH, undefined);
  assert.equal(callOf(gates(["FRESH=1"]), "gates").env.FRESH, "1");
  assert.equal(callOf(gates(["FRESH="]), "gates").env.FRESH, "");
  const marker = markerIn(t);
  const value = `x$(shell touch ${marker.file})`;
  assert.equal(callOf(gates([`FRESH=${value}`]), "gates").env.FRESH, value);
  assert.equal(marker.ran(), false, "FRESH ran a command");
});

// US-QG-02 (issue 1698): ci-tests-base runs the api suite first; db, core and the tool tests run after it, at once. Every suite
// runs even when another one failed, and the run fails when one did. The fake npm marks the end of the api suite, so a db suite
// that starts before the api suite has ended is recorded as an overlap (api and db share the test database).
const SUITE_ORDER = `case "$2" in ci:tests:api) : > "$RECORD_DIR/api-done" ;; ci:tests:db) test -f "$RECORD_DIR/api-done" || : > "$RECORD_DIR/overlap" ;; esac`;

test("US-QG-02 ci-tests-base runs the api suite first, then db, core and the tool tests, and every suite also after a failure (issue 1698)", (t) => {
  const suites = ["ci:tests:api", "ci:tests:db", "ci:tests:core", "ci:tests:tools"];
  const ran = (run) =>
    calls(run)
      .filter((call) => call.tool === "npm")
      .map((call) => call.args[1]);

  const run = makeRun(t, ["-o", "db-up", "ci-tests-base"], { env: { CI: "1" }, npm: SUITE_ORDER });
  assert.equal(run.status, 0, run.out);
  const order = ran(run);
  assert.equal(order[0], "ci:tests:api", "the api suite runs first");
  assert.deepEqual(
    order.slice(1).sort(),
    suites.slice(1).sort(),
    "then db, core and the tool tests",
  );
  assert.equal(
    existsSync(path.join(run.record, "overlap")),
    false,
    "db started before the api suite ended",
  );

  // The suites of CI are the workspaces of the local part ci:tests:workspaces, each with the same arguments: a workspace
  // added there and not here would be skipped in CI.
  const scripts = JSON.parse(
    readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
  ).scripts;
  const [head, args] = scripts["ci:tests:workspaces"].split(" -- ");
  assert.ok(head.startsWith("npm run test -w ") && args, scripts["ci:tests:workspaces"]);
  const workspaces = head
    .slice("npm run test".length)
    .split(" -w ")
    .map((w) => w.trim())
    .filter(Boolean);
  assert.deepEqual(
    workspaces.map((w) => scripts[`ci:tests:${w.replace("@pflanzendex/", "")}`]).sort(),
    workspaces.map((w) => `npm run test -w ${w} -- ${args}`).sort(),
    "every workspace of ci:tests:workspaces has its suite script with the same arguments",
  );
  assert.deepEqual(
    workspaces.map((w) => `ci:tests:${w.replace("@pflanzendex/", "")}`).sort(),
    suites.filter((s) => s !== "ci:tests:tools").sort(),
    "ci-tests-base runs exactly those suites",
  );

  for (const failing of ["ci:tests:api", "ci:tests:core"]) {
    const failed = makeRun(t, ["-o", "db-up", "ci-tests-base"], {
      env: { CI: "1" },
      npm: `${SUITE_ORDER}\ncase "$2" in ${failing}) exit 1 ;; esac`,
    });
    assert.notEqual(failed.status, 0, `${failing} fails the run`);
    assert.deepEqual(
      ran(failed).sort(),
      [...suites].sort(),
      `every suite runs when ${failing} failed`,
    );
  }
});
