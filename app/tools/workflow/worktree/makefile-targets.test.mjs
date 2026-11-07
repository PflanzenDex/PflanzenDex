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
n=$(cat "$RECORD_DIR/seq" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$RECORD_DIR/seq"
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
function makeRun(t, args, { env = {}, docker = null, npm = "" } = {}) {
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
// one-screen and a11y-routes on the same shard; a failed one-screen does not stop a11y-routes, and the run fails.
test("US-QG-01 the UI gates run once per shard: one seed, then one-screen and a11y-routes on the same shard", (t) => {
  const prerequisites = ["-o", "db-up", "-o", "auth-up", "-o", "migrate", "-o", "browsers"];
  const args = [...prerequisites, "ui-gates", "SHARD=2/4", "-j3", "-Otarget"];
  const run = makeRun(t, args, { env: { CI: "1" } });
  assert.equal(run.status, 0, run.out);
  const npm = calls(run).filter((call) => call.tool === "npm");
  assert.deepEqual(
    npm.map((call) => call.args[1]),
    ["seed:demo", "one-screen", "a11y-routes"],
    "one seed, then the two gates",
  );
  assert.equal(npm[1].env.ONE_SCREEN_SHARD, "2/4");
  assert.equal(npm[2].env.A11Y_ROUTES_SHARD, "2/4");
  assert.equal(npm[1].env.TAXONOMY_BUILD, "off");
  assert.equal(npm[2].env.TAXONOMY_BUILD, "off");

  const failing = makeRun(t, args, {
    env: { CI: "1" },
    npm: 'case "$2" in one-screen) exit 1 ;; esac',
  });
  assert.notEqual(failing.status, 0, failing.out);
  const ran = calls(failing)
    .filter((call) => call.tool === "npm")
    .map((call) => call.args[1]);
  assert.deepEqual(ran, ["seed:demo", "one-screen", "a11y-routes"], "a11y-routes runs after it");
});

test("US-QG-01 ui-gates refuses SCREEN, with or without SHARD: one screen is make one-screen", (t) => {
  const prerequisites = ["-o", "db-up", "-o", "auth-up", "-o", "migrate", "-o", "browsers"];
  // SCREEN alone is refused by ui-gates; SCREEN with SHARD by the guard of the one-screen rule, which make reads with every target.
  const refusals = [
    [["SCREEN=today"], /ui-gates: SCREEN measures one screen/],
    [["SCREEN=today", "SHARD=1/4"], /one-screen: SCREEN cannot be combined with SHARD/],
  ];
  for (const [extra, message] of refusals) {
    const run = makeRun(t, [...prerequisites, "ui-gates", ...extra], { env: { CI: "1" } });
    assert.notEqual(run.status, 0, extra.join(" "));
    assert.match(run.out, message);
    assert.equal(calls(run).length, 0, "nothing ran");
  }
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
