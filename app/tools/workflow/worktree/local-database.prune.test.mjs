// Tests of `make db-prune` (US-DEV-08, issue 2396): which test database containers go. The rules are tested on values; the
// command is tested with a fake docker on the PATH and a real git repository in a temporary folder, so no container runs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  decide,
  liveWorktrees,
  parseContainers,
  parseWorktrees,
  prune,
} from "./local-database.prune.mjs";

const cli = fileURLToPath(new URL("./local-database.prune.mjs", import.meta.url));
const MAIN = "pflanzendex-test-db";
const portName = (port) => `pflanzendex-test-db-${port}`;

test("US-DEV-08 the main checkout's test database is kept with no worktree at all and whatever its label says", () => {
  const decided = decide({
    containers: [
      { name: MAIN, label: "" },
      { name: MAIN, label: "/gone/worktree" },
    ],
    worktrees: [],
  });
  assert.deepEqual(
    decided.map((d) => d.action),
    ["keep", "keep"],
  );
});

test("US-DEV-08 a labelled container is kept while its worktree is live and removed once that worktree is gone", () => {
  const [live, gone] = decide({
    containers: [
      { name: portName(54401), label: "/repo/.worktrees/a" },
      { name: portName(54402), label: "/repo/.worktrees/removed" },
    ],
    worktrees: [
      { path: "/repo", port: null },
      { path: "/repo/.worktrees/a", port: "54401" },
    ],
  });
  assert.equal(live.action, "keep");
  assert.equal(gone.action, "remove");
  assert.match(gone.reason, /\/repo\/\.worktrees\/removed is no longer a live worktree/);
});

test("US-DEV-08 an unlabelled container named by a port is kept when a live worktree has that port and removed when none has it", () => {
  const [kept, removed] = decide({
    containers: [
      { name: portName(54401), label: "" },
      { name: portName(54499), label: "" },
    ],
    worktrees: [{ path: "/repo/.worktrees/a", port: "54401" }],
  });
  assert.equal(kept.action, "keep");
  assert.match(kept.reason, /port 54401 is the port of the live worktree \/repo\/\.worktrees\/a/);
  assert.equal(removed.action, "remove");
  assert.match(removed.reason, /no live worktree uses port 54499/);
});

test("US-DEV-08 the label decides over the port: a container of a gone worktree is removed although a live worktree has its port", () => {
  const [decided] = decide({
    containers: [{ name: portName(54401), label: "/repo/.worktrees/gone" }],
    worktrees: [{ path: "/repo/.worktrees/a", port: "54401" }],
  });
  assert.equal(decided.action, "remove");
});

test("US-DEV-08 a container with a name this tool does not know is kept, labelled or not", () => {
  const names = [
    "pflanzendex-test-db-x",
    "my-pflanzendex-test-db-54401",
    "pflanzendex-test-db-54401-old",
    "postgres",
  ];
  const decided = decide({
    containers: names.flatMap((name) => [
      { name, label: "" },
      { name, label: "/gone" },
    ]),
    worktrees: [],
  });
  assert.equal(decided.length, names.length * 2);
  assert.ok(
    decided.every((d) => d.action === "keep"),
    JSON.stringify(decided.filter((d) => d.action !== "keep")),
  );
});

test("US-DEV-08 liveWorktrees keeps the listed paths that exist and takes only the test database port of each .env.worktree", () => {
  const envs = {
    "/repo": null,
    "/repo/.worktrees/a":
      "PFLANZENDEX_TEST_DB_PORT=54401\nPFLANZENDEX_TEST_DB_NAME=pflanzendex_a_1f\n",
  };
  const live = liveWorktrees({
    paths: ["/repo", "/repo/.worktrees/a", "/repo/.worktrees/gone"],
    exists: (p) => p !== "/repo/.worktrees/gone",
    readEnv: (dir) => envs[dir] ?? null,
  });
  assert.deepEqual(live, [
    { path: "/repo", port: null },
    { path: "/repo/.worktrees/a", port: "54401" },
  ]);
});

test("US-DEV-08 parseContainers reads name and label per line; an unlabelled container has an empty label", () => {
  assert.deepEqual(
    parseContainers(`${portName(54401)}\t/repo/.worktrees/a\n${portName(54402)}\t\n`),
    [
      { name: portName(54401), label: "/repo/.worktrees/a" },
      { name: portName(54402), label: "" },
    ],
  );
  assert.deepEqual(parseContainers(""), []);
});

test("US-DEV-08 parseWorktrees reads the paths of git worktree list --porcelain, the main checkout first", () => {
  const porcelain =
    "worktree /repo\nHEAD 1a2b\nbranch refs/heads/dev\n\nworktree /repo/.worktrees/x\nHEAD 3c4d\nbranch refs/heads/x\n\n";
  assert.deepEqual(parseWorktrees(porcelain), ["/repo", "/repo/.worktrees/x"]);
});

// A fake docker for the rule tests: `ps` answers with `ps` (or fails with `psError`), `rm` of a name in `failing` throws.
// Every call is recorded; `removed()` gives the names that `rm` was asked to remove.
function fakeDocker({ ps = "", failing = [], psError = null } = {}) {
  const calls = [];
  const docker = (args) => {
    calls.push(args);
    if (args[0] === "ps") {
      if (psError) throw new Error(psError);
      return ps;
    }
    if (args[0] === "rm" && failing.includes(args.at(-1)))
      throw new Error(`cannot remove ${args.at(-1)}`);
    return "";
  };
  return {
    docker,
    calls,
    removed: () => calls.filter((args) => args[0] === "rm").map((args) => args.at(-1)),
  };
}

// The world of the command tests: the main checkout, worktree a (its container is labelled with its path) and worktree b (its
// .env.worktree sets port 54501, its container is unlabelled). Containers: the main one, one labelled live, one labelled with a
// worktree that is gone, two unlabelled (one with the port of b, one with no owner).
const LIVE = {
  git: "worktree /repo\n\nworktree /repo/.worktrees/a\n\nworktree /repo/.worktrees/b\n\n",
  exists: (p) => ["/repo", "/repo/.worktrees/a", "/repo/.worktrees/b"].includes(p),
  readEnv: (dir) => (dir === "/repo/.worktrees/b" ? "PFLANZENDEX_TEST_DB_PORT=54501\n" : null),
};
const PS = [
  `${MAIN}\t`,
  `${portName(54401)}\t/repo/.worktrees/a`,
  `${portName(54402)}\t/repo/.worktrees/removed`,
  `${portName(54403)}\t`,
  `${portName(54501)}\t`,
].join("\n");
const fsOf = () => ({ canonical: (p) => p, exists: LIVE.exists, readEnv: LIVE.readEnv });

function runPrune(docker, { dryRun = false } = {}) {
  const out = [];
  const errs = [];
  const code = prune({
    dryRun,
    docker: docker.docker,
    git: () => LIVE.git,
    fs: fsOf(),
    log: (line) => out.push(line),
    err: (line) => errs.push(line),
  });
  return { code, out, errs };
}

test("US-DEV-08 prune removes with docker rm -f -v only the containers without a live worktree and prints one line per container", () => {
  const d = fakeDocker({ ps: `${PS}\n` });
  const run = runPrune(d);
  assert.equal(run.code, 0);
  assert.deepEqual(
    d.calls.filter((args) => args[0] === "rm"),
    [
      ["rm", "-f", "-v", portName(54402)],
      ["rm", "-f", "-v", portName(54403)],
    ],
  );
  assert.deepEqual(
    run.out.map((line) => line.split(":")[0]),
    [
      `kept ${MAIN}`,
      `kept ${portName(54401)}`,
      `removed ${portName(54402)}`,
      `removed ${portName(54403)}`,
      `kept ${portName(54501)}`,
    ],
  );
  assert.deepEqual(run.errs, []);
});

test("US-DEV-08 DRY_RUN prints would remove for each container it would remove and runs no rm", () => {
  const d = fakeDocker({ ps: PS });
  const run = runPrune(d, { dryRun: true });
  assert.equal(run.code, 0);
  assert.deepEqual(d.removed(), [], "no rm runs in a dry run");
  assert.ok(
    run.out.includes(
      `would remove ${portName(54402)}: its worktree /repo/.worktrees/removed is no longer a live worktree`,
    ),
  );
  assert.ok(run.out.some((line) => line.startsWith(`would remove ${portName(54403)}:`)));
  assert.ok(run.out.some((line) => line.startsWith(`kept ${MAIN}:`)));
});

test("US-DEV-08 prune lists the containers with the name filter and a format that carries the worktree label", () => {
  const d = fakeDocker({ ps: "" });
  runPrune(d);
  const [list] = d.calls;
  assert.deepEqual(list.slice(0, 5), [
    "ps",
    "-a",
    "--filter",
    "name=pflanzendex-test-db",
    "--format",
  ]);
  assert.match(list[5], /\{\{\.Label "pflanzendex\.worktree"\}\}/);
});

test("US-DEV-08 a removal that fails is printed as not removed, the other containers still go, and the run exits 1", () => {
  const d = fakeDocker({ ps: PS, failing: [portName(54402)] });
  const run = runPrune(d);
  assert.equal(run.code, 1);
  assert.deepEqual(d.removed(), [portName(54402), portName(54403)]);
  assert.deepEqual(run.errs, [`not removed ${portName(54402)}: cannot remove ${portName(54402)}`]);
});

test("US-DEV-08 a docker that cannot list the containers stops the run before any removal", () => {
  const d = fakeDocker({ psError: "Cannot connect to the Docker daemon" });
  assert.throws(() => runPrune(d), /Cannot connect to the Docker daemon/);
  assert.deepEqual(d.removed(), []);
});

test("US-DEV-08 with no test database container prune says so and removes nothing", () => {
  const d = fakeDocker({ ps: "" });
  const run = runPrune(d);
  assert.equal(run.code, 0);
  assert.deepEqual(run.out, ["db-prune: no test database containers"]);
  assert.deepEqual(d.removed(), []);
});

// The command itself: `node local-database.prune.mjs` in a temporary repository, with a fake docker first on the PATH. The repository has a
// main checkout and a linked worktree `wt-a` whose .env.worktree sets port 54501 (the file's other lines must never be printed).
function sandbox(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "db-prune-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const main = path.join(dir, "main");
  const linked = path.join(dir, "wt-a");
  const bin = path.join(dir, "bin");
  mkdirSync(main);
  mkdirSync(bin);
  const git = (cwd, args) => {
    const r = spawnSync(
      "git",
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "user.name=test",
        "-c",
        "user.email=test@example.org",
        ...args,
      ],
      { cwd, encoding: "utf8", env: gitFreeEnv() },
    );
    assert.equal(r.status, 0, r.stderr);
  };
  git(main, ["init", "-q"]);
  git(main, ["commit", "-q", "--allow-empty", "-m", "init"]);
  git(main, ["worktree", "add", "-q", "-b", "wt-a", linked]);
  writeFileSync(
    path.join(linked, ".env.worktree"),
    "PFLANZENDEX_TEST_DB_PORT=54501\nPFLANZENDEX_TEST_DB_NAME=pflanzendex_a_1f\n",
  );
  const psFile = path.join(dir, "ps.txt");
  const callsFile = path.join(dir, "calls.txt");
  writeFileSync(
    psFile,
    [
      `${MAIN}\t`,
      `${portName(54401)}\t${linked}`,
      `${portName(54402)}\t${path.join(dir, "removed")}`,
      `${portName(54499)}\t`,
      `${portName(54501)}\t`,
    ].join("\n") + "\n",
  );
  writeFileSync(
    path.join(bin, "docker"),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "${callsFile}"\nif [ "$1" = ps ]; then cat "${psFile}"; fi\nexit 0\n`,
    { mode: 0o755 },
  );
  return { main, bin, callsFile, emptyBin: path.join(dir, "empty") };
}

// The environment of a child process: no GIT_ variable of an outer git hook, and no DRY_RUN of the caller.
function gitFreeEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_") && name !== "DRY_RUN"),
  );
}

const callsOf = (s) =>
  existsSync(s.callsFile)
    ? readFileSync(s.callsFile, "utf8")
        .split("\n")
        .filter((line) => line !== "")
    : [];

// Whether one line of the command's output starts with `prefix` (the name and the reason come after it).
const printed = (text, prefix) => text.split("\n").some((line) => line.startsWith(prefix));

test("US-DEV-08 the command removes the test databases of gone worktrees, keeps the rest, and reads only the port of .env.worktree", (t) => {
  const s = sandbox(t);
  const run = (env) =>
    spawnSync(process.execPath, [cli], {
      cwd: s.main,
      encoding: "utf8",
      env: { ...gitFreeEnv(), PATH: `${s.bin}${path.delimiter}${process.env.PATH}`, ...env },
    });

  const dry = run({ DRY_RUN: "1" });
  assert.equal(dry.status, 0, dry.stderr);
  assert.ok(printed(dry.stdout, `would remove ${portName(54402)}: `));
  assert.ok(printed(dry.stdout, `would remove ${portName(54499)}: `));
  assert.ok(printed(dry.stdout, `kept ${portName(54501)}: `));
  assert.deepEqual(
    callsOf(s).filter((line) => line.startsWith("rm ")),
    [],
    "a dry run removes nothing",
  );

  const real = run({});
  assert.equal(real.status, 0, real.stderr);
  assert.ok(printed(real.stdout, `removed ${portName(54402)}: `));
  assert.ok(printed(real.stdout, `kept ${MAIN}: `));
  assert.deepEqual(
    callsOf(s).filter((line) => line.startsWith("rm ")),
    [`rm -f -v ${portName(54402)}`, `rm -f -v ${portName(54499)}`],
  );
  assert.doesNotMatch(`${dry.stdout}${real.stdout}`, /pflanzendex_a_1f|PFLANZENDEX_TEST_DB_NAME/);
});

test("US-DEV-08 the command exits 1 with a message when docker cannot be started, and removes nothing", (t) => {
  const s = sandbox(t);
  mkdirSync(s.emptyBin);
  const r = spawnSync(process.execPath, [cli], {
    cwd: s.main,
    encoding: "utf8",
    env: { ...gitFreeEnv(), PATH: s.emptyBin },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^db-prune: /);
});
