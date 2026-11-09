// US-QG-06: the quarantine list of the CI. The reader, its command line (ci-status, the results job and `make quarantine`)
// and the wiring in ci.yml, nightly.yml and the Makefile. The command line runs on a temp copy of the list and ci.yml.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { jobsDefinedIn } from "./ci-verdict.mjs";
import {
  addEntry,
  judgeJobs,
  parseQuarantine,
  QUARANTINE_PATH,
  quarantineLine,
  unknownJobs,
  utcDay,
} from "./quarantine.mjs";
import { main, readQuarantine } from "./quarantine-cli.mjs";

const REPO = fileURLToPath(new URL("../../../../../../", import.meta.url));
const CLI = fileURLToPath(new URL("./quarantine-cli.mjs", import.meta.url));
const CI_YML = readFileSync(path.join(REPO, ".github/workflows/ci.yml"), "utf8");
const DEFINED = jobsDefinedIn(CI_YML);
const ENTRY = { job: "lighthouse", since: "2026-11-09", issue: 1748, reason: "red on dev" };
const listOf = (maxEntries, entries) => JSON.stringify({ maxEntries, entries }, null, 2);
const needsOf = (results) =>
  JSON.stringify(
    Object.fromEntries(Object.entries(results).map(([job, result]) => [job, { result }])),
  );

/** A temp repository with the given list and ci.yml, removed after `fn`. */
function withRoot(listText, fn, ciText = CI_YML) {
  const root = mkdtempSync(path.join(os.tmpdir(), "quarantine-"));
  try {
    mkdirSync(path.join(root, ".github/workflows"), { recursive: true });
    mkdirSync(path.join(root, path.dirname(QUARANTINE_PATH)), { recursive: true });
    writeFileSync(path.join(root, ".github/workflows/ci.yml"), ciText);
    writeFileSync(path.join(root, QUARANTINE_PATH), listText);
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** The command line as a step runs it: from the top of the repository, the inputs in the environment only. */
function cli(args, root, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...env },
  });
}

/** Runs `main` with its output captured, so a test reads what the command printed and what it refused. */
function run(fn) {
  const out = [];
  const err = [];
  const log = console.log;
  const error = console.error;
  console.log = (...parts) => out.push(parts.join(" "));
  console.error = (...parts) => err.push(parts.join(" "));
  try {
    return { code: fn(), out: out.join("\n"), err: err.join("\n") };
  } finally {
    console.log = log;
    console.error = error;
  }
}

test("US-QG-06: the list of this repository is valid, empty, and names no unknown job", () => {
  const list = readFileSync(path.join(REPO, QUARANTINE_PATH), "utf8");
  assert.deepEqual(parseQuarantine(list), { maxEntries: 0, entries: [] });
  assert.deepEqual(readQuarantine(REPO), []);
});

test("US-QG-06: a list of the format is read as its entries", () => {
  assert.deepEqual(parseQuarantine(listOf(1, [ENTRY])).entries, [ENTRY]);
  assert.deepEqual(parseQuarantine(listOf(0, [])).entries, []);
});

test("US-QG-06: text that does not fit the format is refused, so the list judges nothing", () => {
  const cases = [
    ["not json", /not JSON/],
    ["[]", /not an object/],
    ['{"maxEntries":0,"entries":[],"note":1}', /has the field note/],
    ['{"entries":[]}', /maxEntries is not a whole number/],
    ['{"maxEntries":0}', /entries is not a list/],
    [listOf(0, [ENTRY]), /above maxEntries/],
    [listOf(2, [ENTRY, ENTRY]), /lists lighthouse twice/],
    [listOf(1, [{ ...ENTRY, job: "Bad Job" }]), /not a job id/],
    [listOf(1, [{ ...ENTRY, since: "09.11.2026" }]), /no since date/],
    [listOf(1, [{ ...ENTRY, issue: 0 }]), /no issue number/],
    [listOf(1, [{ ...ENTRY, reason: "  " }]), /no reason/],
    [listOf(1, [{ ...ENTRY, owner: "x" }]), /has the field owner/],
  ];
  for (const [text, message] of cases) assert.throws(() => parseQuarantine(text), message, text);
});

test("US-QG-06: a red job of the list is quarantined and blocks nothing; any other red job fails", () => {
  const judged = judgeJobs(
    { changes: "success", lighthouse: "failure", "app-gates": "cancelled", e2e: "skipped" },
    [ENTRY],
  );
  assert.equal(judged.green, false);
  assert.deepEqual(judged.failed, [{ job: "app-gates", result: "cancelled" }]);
  assert.deepEqual(judged.quarantined, [
    { job: "lighthouse", result: "failure", since: "2026-11-09", issue: 1748 },
  ]);
  assert.equal(judgeJobs({ lighthouse: "failure" }, [ENTRY]).green, true);
  assert.equal(judgeJobs({ lighthouse: "failure" }, []).green, false);
});

test("US-QG-06: the reader refuses a list entry that names a job ci.yml does not define (a typo hides nothing)", () => {
  assert.deepEqual(unknownJobs([ENTRY], DEFINED), []);
  assert.deepEqual(unknownJobs([{ ...ENTRY, job: "lighthous" }], DEFINED), ["lighthous"]);
  withRoot(listOf(1, [{ ...ENTRY, job: "lighthous" }]), (root) => {
    assert.throws(() => readQuarantine(root), /lighthous, which ci.yml does not define/);
  });
});

test("US-QG-06: ci-status exits 1 for a red job that the list does not quarantine, and names it", () => {
  withRoot(listOf(0, []), (root) => {
    const out = cli(["status"], root, {
      NEEDS_JSON: needsOf({ changes: "success", lighthouse: "failure" }),
    });
    assert.equal(out.status, 1);
    assert.match(out.stdout, /^failed: lighthouse \(failure\)$/m);
    assert.doesNotMatch(out.stdout, /ci-status: green/);
  });
});

test("US-QG-06: ci-status stays green for a quarantined red job, prints the quarantined line and writes it to the summary", () => {
  withRoot(listOf(1, [ENTRY]), (root) => {
    const summary = path.join(root, "summary.md");
    writeFileSync(summary, "");
    const out = cli(["status"], root, {
      NEEDS_JSON: needsOf({ changes: "success", lighthouse: "failure" }),
      GITHUB_STEP_SUMMARY: summary,
    });
    const line =
      "quarantined since 2026-11-09, #1748: lighthouse was failure (report only, US-QG-06)";
    assert.equal(out.status, 0, out.stderr);
    assert.ok(out.stdout.split("\n").includes(line), out.stdout);
    assert.ok(out.stdout.split("\n").includes("ci-status: green"));
    assert.ok(readFileSync(summary, "utf8").split("\n").includes(`- ${line}`));
    assert.equal(
      quarantineLine({ job: "lighthouse", result: "failure", since: "2026-11-09", issue: 1748 }),
      line,
    );
  });
});

test("US-QG-06: ci-status refuses an unreadable list or NEEDS_JSON that names no job (fail closed)", () => {
  withRoot(listOf(1, [{ ...ENTRY, job: "lighthous" }]), (root) => {
    const out = cli(["status"], root, { NEEDS_JSON: needsOf({ lighthouse: "failure" }) });
    assert.equal(out.status, 2);
    assert.match(out.stderr, /lighthous, which ci.yml does not define/);
    assert.doesNotMatch(out.stdout, /ci-status: green/);
  });
  withRoot(listOf(0, []), (root) => {
    assert.equal(cli(["status"], root, { NEEDS_JSON: "{}" }).status, 2);
    assert.equal(cli(["status"], root, { NEEDS_JSON: "not json" }).status, 2);
  });
});

test("US-QG-06: the results job asks for a quarantined red job only: a listed ui-shard passes, an unlisted one does not", () => {
  withRoot(listOf(1, [{ ...ENTRY, job: "ui-shard" }]), (root) => {
    const yes = cli(["quarantined", "ui-shard", "failure"], root);
    assert.equal(yes.status, 0, yes.stderr);
    assert.match(yes.stdout, /ui-shard was failure \(report only, US-QG-06\)/);
    assert.equal(cli(["quarantined", "ui-shard", "success"], root).status, 1);
    assert.equal(cli(["quarantined", "app-tests", "failure"], root).status, 1);
  });
  withRoot(listOf(0, []), (root) => {
    assert.equal(cli(["quarantined", "ui-shard", "failure"], root).status, 1);
  });
  withRoot(listOf(1, [{ ...ENTRY, job: "ui-shrd" }]), (root) => {
    assert.equal(cli(["quarantined", "ui-shard", "failure"], root).status, 2, "a bad list fails");
  });
});

test("US-QG-06: make quarantine adds one entry with today's UTC day, raises maxEntries by one, and prints the next steps", () => {
  withRoot(listOf(0, []), (root) => {
    const listPath = path.join(root, QUARANTINE_PATH);
    const env = { RAW_JOB: "lighthouse", REST_ISSUE: "1748", RAW_REASON: "red on dev, run 42" };
    const out = run(() => main(["add"], env, root, new Date("2026-11-09T10:00:00Z")));
    assert.equal(out.code, 0, out.err);
    assert.deepEqual(JSON.parse(readFileSync(listPath, "utf8")), {
      maxEntries: 1,
      entries: [
        { job: "lighthouse", since: "2026-11-09", issue: 1748, reason: "red on dev, run 42" },
      ],
    });
    assert.match(out.out, /git add app\/config\/gates\/baselines\/quarantine-baseline\.json/);
  });
});

test("US-QG-06: make quarantine refuses an unknown job, ci-status, a bad issue, an empty reason or a job listed twice, and writes nothing", () => {
  withRoot(listOf(1, [ENTRY]), (root) => {
    const listPath = path.join(root, QUARANTINE_PATH);
    const before = readFileSync(listPath, "utf8");
    const good = { RAW_JOB: "e2e", REST_ISSUE: "1748", RAW_REASON: "red" };
    const refusals = [
      [{ ...good, RAW_JOB: "nope" }, /nope is not a job of ci.yml/],
      [{ ...good, RAW_JOB: "ci-status" }, /ci-status is the aggregate/],
      [{ ...good, REST_ISSUE: "12a" }, /ISSUE=<n> must be a positive number/],
      [{ ...good, REST_ISSUE: "0" }, /ISSUE=<n> must be a positive number/],
      [{ ...good, RAW_REASON: "  " }, /REASON=/],
      [{ ...good, RAW_JOB: "lighthouse" }, /lighthouse is already quarantined/],
      [{ ...good, RAW_JOB: "$(rm -rf x)" }, /JOB=<job> must be a job id/],
    ];
    for (const [env, message] of refusals) {
      const out = run(() => main(["add"], env, root, new Date("2026-11-09T10:00:00Z")));
      assert.equal(out.code, 2, JSON.stringify(env));
      assert.match(out.err, message);
      assert.equal(readFileSync(listPath, "utf8"), before, "a refused add writes nothing");
    }
  });
});

test("US-QG-06: addEntry keeps the list in the format, and a removed entry with a lower maxEntries is a valid list", () => {
  const next = addEntry(
    listOf(0, []),
    { job: "lighthouse", issue: "1748", reason: " red ", since: "2026-11-09" },
    DEFINED,
  );
  assert.equal(
    next,
    `${listOf(1, [{ job: "lighthouse", since: "2026-11-09", issue: 1748, reason: "red" }])}\n`,
  );
  assert.deepEqual(parseQuarantine(listOf(0, [])), { maxEntries: 0, entries: [] });
});

test("US-QG-06: the UTC day of a date is the day in UTC, not the local day", () => {
  assert.equal(utcDay(new Date("2026-11-09T01:30:00+02:00")), "2026-11-08");
  assert.equal(utcDay(new Date("2026-11-08T23:30:00-02:00")), "2026-11-09");
});

test("US-QG-06: ci.yml runs ci-status through the reader with the needs in one env variable, and the results job asks for ui-shard", () => {
  const statusBlock = CI_YML.slice(CI_YML.indexOf("\n  ci-status:\n"));
  assert.match(statusBlock, /NEEDS_JSON: \$\{\{ toJSON\(needs\) \}\}/);
  assert.match(statusBlock, /run: make ci-quarantine$/m);
  const runLines = statusBlock.split("\n").filter((line) => /^\s*run:/.test(line));
  assert.deepEqual(
    runLines.filter((line) => line.includes("${{")),
    [],
    "no expression goes into a run of ci-status",
  );
  assert.match(CI_YML, /if make ci-quarantine-ui; then/);
  const resultsContinue = CI_YML.split("\n").filter((line) =>
    line.includes("continue-on-error: ${{ steps.quarantine.outputs.ui == 'true' }}"),
  );
  assert.equal(
    resultsContinue.length,
    8,
    "every UI part of results is report only when quarantined",
  );
});

test("US-QG-06: make quarantine passes JOB and REASON raw through the environment, never into the recipe", () => {
  const makefile = readFileSync(path.join(REPO, "Makefile"), "utf8");
  assert.match(makefile, /^export RAW_JOB := \$\(value JOB\)$/m);
  assert.match(makefile, /^export RAW_REASON := \$\(value REASON\)$/m);
  assert.match(makefile, /^unexport .*\bJOB\b.*\bREASON\b/m);
  assert.match(
    makefile,
    /^quarantine: .*\n\tnode \$\(APP\)\/tools\/workflow\/actions\/ci-reuse\/verdict\/quarantine-cli\.mjs add$/m,
  );
});

test("US-QG-06: the nightly report names each red job, its CI job and the ready command, and needs lighthouse", () => {
  const nightly = readFileSync(path.join(REPO, ".github/workflows/nightly.yml"), "utf8");
  assert.match(nightly, /needs: \[suite, e2e, lighthouse-signed, lighthouse\]/);
  assert.match(nightly, /make quarantine JOB=/);
  assert.doesNotMatch(nightly, /create-pull-request|git push/, "the nightly opens no pull request");
});

test("US-QG-06: the two CI calls of the list are Make targets, declared in .PHONY, and take their input from the environment", () => {
  const makefile = readFileSync(path.join(REPO, "Makefile"), "utf8");
  assert.match(
    makefile,
    /^ci-quarantine: .*\n\tnode \$\(APP\)\/tools\/workflow\/actions\/ci-reuse\/verdict\/quarantine-cli\.mjs status$/m,
  );
  assert.match(
    makefile,
    /^ci-quarantine-ui: .*\n\tnode \$\(APP\)\/tools\/workflow\/actions\/ci-reuse\/verdict\/quarantine-cli\.mjs quarantined ui-shard "\$\$UI_SHARD"$/m,
  );
  const phony = makefile.split("\n").find((line) => line.startsWith(".PHONY:"));
  for (const target of ["quarantine", "ci-quarantine", "ci-quarantine-ui"]) {
    assert.ok(phony.split(/\s+/).includes(target), `${target} is in .PHONY`);
  }
});
