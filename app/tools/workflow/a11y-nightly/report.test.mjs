// US-QG-02 (issue 2666): the counts and the text of the warning tier of the accessibility gate, and the rolling issue. The gh calls
// are a fake here; the folder of the results is a temporary one.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  countA11y,
  countFile,
  countOneScreen,
  countsIn,
  dayOf,
  main,
  publish,
  renderComment,
  renderIssueBody,
  runLine,
  UNKNOWN,
} from "./report.mjs";

const run = {
  date: "2026-11-28",
  runUrl: "https://example.test/runs/1",
  counts: { text200: "3", forcedColors: "0", reducedMotion: "1" },
};

test("US-QG-02 one-screen: a screen and size that fails counts once; a fitting one does not", () => {
  const results = [
    { screen: "today", size: "360x640@200%", failures: ["page 1.20"] },
    { screen: "today", size: "390x844", failures: [] },
    { screen: "wishlist", size: "360x640@200%", failures: ["cap", "inner 2.00"] },
  ];
  assert.equal(countOneScreen(results), 2);
  assert.equal(countOneScreen([]), 0);
});

test("US-QG-02 a11y: the findings count is the sum of the elements over every screen, check and rule", () => {
  const results = [
    {
      screen: "a",
      size: "390x844",
      findings: [{ kind: "axe", rule: "label", count: 2, nodes: [] }],
    },
    {
      screen: "b",
      size: "1920x1080",
      findings: [
        { kind: "keyboard", rule: "reach", count: 1, nodes: [] },
        { kind: "axe", rule: "color-contrast", count: 3, nodes: [] },
      ],
    },
    { screen: "c", size: "390x844", findings: [] },
  ];
  assert.equal(countA11y(results), 6);
});

test("US-QG-02 a missing results file is unknown, never 0 (P-10); a file that is no list of results is unknown too", () => {
  assert.equal(countFile("one-screen", undefined), UNKNOWN);
  assert.equal(countFile("a11y", "{}"), UNKNOWN);
  assert.equal(countFile("a11y", "[]"), "0");
  assert.equal(countFile("one-screen", JSON.stringify([{ failures: ["x"] }])), "1");
});

test("US-QG-02 the three counts of a folder: each file counts on its own, a missing one is unknown", () => {
  const files = { "one-screen.json": JSON.stringify([{ failures: ["x"] }]) };
  const counts = countsIn("/dir", (path) => files[path.split("/").pop()]);
  assert.deepEqual(counts, { text200: "1", forcedColors: UNKNOWN, reducedMotion: UNKNOWN });
});

test("US-QG-02 the run day is the calendar day as YYYY-MM-DD", () => {
  assert.equal(dayOf(new Date(2026, 10, 28, 23, 30)), "2026-11-28");
  assert.equal(dayOf(new Date(2026, 0, 2, 0, 5)), "2026-01-02");
});

test("US-QG-02 the line of a run names the date, the link and the three counts of the warning tier", () => {
  assert.equal(
    runLine(run),
    "- 2026-11-28, [run](https://example.test/runs/1): 200 % text: 3, forced colors: 0, reduced motion: 1",
  );
});

test("US-QG-02 the rolling issue: its body holds the heading and the first run; a later run is one comment line", () => {
  const body = renderIssueBody(run);
  assert.match(body, /^# Accessibility warnings of the nightly run \(US-QG-02, issue 2666\)/);
  assert.match(body, /never fails a job and never blocks a release/);
  assert.ok(body.trimEnd().endsWith(runLine(run)));
  assert.equal(renderComment(run), runLine(run) + "\n");
});

/** A fake gh: records each call, answers from `answers` (a function of the arguments) and fails for a listed error. */
function fakeGh(answers, failures = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    const key = args.slice(0, 2).join(" ");
    if (failures[key]) throw failures[key];
    return answers[key] ?? "";
  };
  return { gh, calls };
}

test("US-QG-02 the rolling issue is made once: with no open issue the body is written and the issue is created with both labels", () => {
  const dir = mkdtempSync(join(tmpdir(), "a11y-nightly-"));
  try {
    const { gh, calls } = fakeGh({
      "issue list": "[]",
      "issue create": "https://example.test/issues/9\n",
    });
    const files = { "one-screen.json": JSON.stringify([{ failures: ["x"] }]) };
    const out = publish({
      dir,
      runUrl: "https://example.test/runs/1",
      day: "2026-11-28",
      read: (path) => files[path.split("/").pop()],
      gh,
    });
    assert.match(out, /issue created https:\/\/example\.test\/issues\/9/);
    const create = calls.find((args) => args[0] === "issue" && args[1] === "create");
    assert.deepEqual(create.slice(0, 6), [
      "issue",
      "create",
      "--label",
      "a11y-nightly,report",
      "--title",
      "Accessibility warnings of the nightly run",
    ]);
    const body = readFileSync(join(dir, "body.md"), "utf8");
    assert.match(body, /200 % text: 1, forced colors: unknown, reduced motion: unknown/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("US-QG-02 a later run comments on the open rolling issue and creates none", () => {
  const dir = mkdtempSync(join(tmpdir(), "a11y-nightly-"));
  try {
    const { gh, calls } = fakeGh({ "issue list": JSON.stringify([{ number: 7 }]) });
    const out = publish({
      dir,
      runUrl: "https://example.test/runs/2",
      day: "2026-11-29",
      read: () => undefined,
      gh,
    });
    assert.match(out, /comment on #7/);
    assert.ok(
      calls.some((args) => args[0] === "issue" && args[1] === "comment" && args[2] === "7"),
    );
    assert.ok(!calls.some((args) => args[0] === "issue" && args[1] === "create"));
    assert.match(
      readFileSync(join(dir, "comment.md"), "utf8"),
      /^- 2026-11-29, \[run\]\(https:\/\/example\.test\/runs\/2\)/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("US-QG-02 the label that already exists is no failure; another failure of the label call is shown, not hidden", () => {
  const dir = mkdtempSync(join(tmpdir(), "a11y-nightly-"));
  try {
    const exists = Object.assign(new Error("exit 1"), {
      stderr: "label a11y-nightly already exists",
    });
    const { gh } = fakeGh(
      { "issue list": JSON.stringify([{ number: 3 }]) },
      { "label create": exists },
    );
    assert.match(
      publish({ dir, runUrl: "u", day: "d", read: () => undefined, gh }),
      /comment on #3/,
    );
    const denied = Object.assign(new Error("exit 1"), { stderr: "HTTP 403" });
    const refused = fakeGh({}, { "label create": denied });
    assert.throws(
      () => publish({ dir, runUrl: "u", day: "d", read: () => undefined, gh: refused.gh }),
      (error) => error.stderr === "HTTP 403",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("US-QG-02 the CLI: count prints the number of a results file, unknown for a missing one; publish needs WARN_DIR and RUN_URL", () => {
  assert.equal(main(["count", "a11y", "/no/such/results.json"]), UNKNOWN);
  assert.throws(() => main(["count", "nope", "x.json"]), /usage: count/);
  assert.throws(() => main(["publish"], {}), /WARN_DIR and RUN_URL must be set/);
  assert.throws(() => main(["render", "body"]), /usage: report\.mjs/);
  const dir = mkdtempSync(join(tmpdir(), "a11y-nightly-"));
  try {
    const { gh } = fakeGh({ "issue list": JSON.stringify([{ number: 5 }]) });
    const out = main(
      ["publish"],
      { WARN_DIR: dir, RUN_URL: "https://example.test/runs/3" },
      {
        gh,
        now: () => new Date("2026-11-30T02:00:00Z"),
      },
    );
    assert.match(out, /comment on #5/);
    assert.match(readFileSync(join(dir, "comment.md"), "utf8"), /^- 2026-11-30, /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
