import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { classifyFile, directionOf, needsText } from "./gate-direction.mjs";

// Texts of real gate-file commits (gate-direction.fixtures.json, generated from `git show <commit>`), read as they were.
const FX = JSON.parse(
  readFileSync(new URL("./gate-direction.fixtures.json", import.meta.url), "utf8"),
);
const LIMITS = "app/config/gates/quality-limits.json";
const AUDIT = "app/config/gates/audit-allowlist.json";
const COVERAGE = "app/config/gates/coverage-thresholds.json";

const modified = (path, before, after) =>
  classifyFile({ path, status: "modified", before: { text: before }, after: { text: after } });
const nest = (path, value) => path.reduceRight((acc, key) => ({ [key]: acc }), value);

test("US-QG-07: a real ceiling raised (bundle budget 125000 to 140000, commit a396ba59) is looser, with the key and both values", () => {
  const c = FX["bundle-ceiling-raised"];
  const j = modified(c.path, c.before, c.after);
  assert.deepEqual(j.looser, [`${c.path}: bundle.initialJsGzipBytes raised from 125000 to 140000`]);
  assert.deepEqual(j.tighter, []);
  assert.deepEqual(j.readIt, []);
  assert.equal(directionOf([j]).verdict, "looser");
});

test("US-QG-07: the same real ceiling read backwards is tighter, never looser", () => {
  const c = FX["bundle-ceiling-raised"];
  const j = modified(c.path, c.after, c.before);
  assert.deepEqual(j.tighter, [
    `${c.path}: bundle.initialJsGzipBytes lowered from 140000 to 125000`,
  ]);
  assert.deepEqual(j.looser, []);
  assert.equal(directionOf([j]).verdict, "tighter only");
});

test("US-QG-07: a real new load-budget section (commit 06ad499d) is read it, never looser or tighter", () => {
  const c = FX["perf-section-added"];
  const j = modified(c.path, c.before, c.after);
  assert.deepEqual(j.readIt, [`${c.path}: perf added or removed`]);
  assert.deepEqual(j.looser, []);
  assert.deepEqual(j.tighter, []);
  assert.equal(directionOf([j]).verdict, "read it");
});

test("US-QG-07: a real allowlist change (commit 4b23cbfa) names each added advisory as looser and each removed one as tighter", () => {
  const c = FX["allowlist-advisories-swapped"];
  const j = modified(c.path, c.before, c.after);
  assert.equal(j.looser.length, 4);
  assert.equal(j.tighter.length, 5);
  assert.ok(j.looser.includes(`${c.path}: GHSA-gg6h-894w-4m9c added to the allowlist`));
  assert.ok(j.tighter.includes(`${c.path}: GHSA-vfj7-8cjw-p6xm removed from the allowlist`));
  assert.equal(directionOf([j]).verdict, "looser");
});

test("US-QG-07: a real baseline entry removed (commit 5173d2e8) only shrinks: tighter, never looser", () => {
  const c = FX["baseline-entry-removed"];
  const j = modified(c.path, c.before, c.after);
  assert.deepEqual(j.looser, []);
  assert.deepEqual(j.tighter, [`${c.path}: it shrinks`]);
  assert.equal(directionOf([j]).verdict, "tighter only");
});

test("US-QG-07: a baseline that gains an entry again (the real shrink read backwards) is looser, as make merge rules", () => {
  const c = FX["baseline-entry-removed"];
  const j = modified(c.path, c.after, c.before);
  assert.ok(j.looser.length >= 1);
  assert.ok(j.looser.every((t) => t.startsWith(`${c.path}: `)));
  assert.equal(directionOf([j]).verdict, "looser");
});

test("US-QG-07: a coverage threshold lowered is looser and raised is tighter (synthetic from the real file)", () => {
  const c = FX["coverage-current"];
  const lowered = modified(COVERAGE, c.before, c.before.replace('"lines": 98', '"lines": 95'));
  assert.deepEqual(lowered.looser, [`${COVERAGE}: packages.core.lines lowered from 98 to 95`]);
  const raised = modified(COVERAGE, c.before, c.before.replace('"lines": 98', '"lines": 99'));
  assert.deepEqual(raised.tighter, [`${COVERAGE}: packages.core.lines raised from 98 to 99`]);
  assert.deepEqual(raised.looser, []);
});

test("US-QG-07: a coverage package set to null is looser, because no threshold is enforced for it", () => {
  const c = FX["coverage-current"];
  const data = JSON.parse(c.before);
  data.packages.web = null;
  const j = modified(COVERAGE, c.before, JSON.stringify(data, null, 2));
  assert.deepEqual(j.looser, [
    `${COVERAGE}: packages.web set to null, so no threshold is enforced`,
  ]);
});

test("US-QG-07: a comment-only change is unchanged: no value moved, and nothing is called tighter", () => {
  const c = FX["coverage-current"];
  const j = modified(
    COVERAGE,
    c.before,
    c.before.replace("Single source of truth", "Single source, reworded"),
  );
  assert.deepEqual([j.looser, j.tighter, j.readIt], [[], [], []]);
  assert.equal(directionOf([j]).verdict, "unchanged");
});

test("US-QG-07: an allowlist expiry moved later is looser and moved earlier is tighter", () => {
  const c = FX["allowlist-advisories-swapped"];
  const later = JSON.parse(c.after);
  later.entries[0].expires = "2027-02-01";
  const id = JSON.parse(c.after).entries[0].advisory;
  const j = modified(AUDIT, c.after, JSON.stringify(later));
  assert.deepEqual(j.looser, [`${AUDIT}: ${id} expiry moved from 2026-11-28 to 2027-02-01`]);
  const earlier = JSON.parse(c.after);
  earlier.entries[0].expires = "2026-11-01";
  const k = modified(AUDIT, c.after, JSON.stringify(earlier));
  assert.deepEqual(k.tighter, [`${AUDIT}: ${id} expiry moved from 2026-11-28 to 2026-11-01`]);
});

test("US-QG-07: a judged number loosens in the direction of its check (a ceiling when raised, a floor when lowered)", () => {
  const cases = [
    [LIMITS, ["default", "complexity"], 15, 20],
    [LIMITS, ["dup", "slackPercent"], 0.1, 0.5],
    [LIMITS, ["duplicates", "minOccurrences"], 3, 4],
    [LIMITS, ["lighthouse", "maxCls"], 0.1, 0.2],
    [LIMITS, ["lighthouse", "minScores", "performance"], 88, 85],
  ];
  for (const [path, key, was, now] of cases) {
    const j = modified(path, JSON.stringify(nest(key, was)), JSON.stringify(nest(key, now)));
    assert.equal(j.looser.length, 1, key.join("."));
    assert.equal(j.tighter.length, 0, key.join("."));
  }
});

test("US-QG-07: a value with no direction (the load sample size, a boolean switch) is read it, never tighter", () => {
  const c = FX["perf-section-added"];
  const size = modified(LIMITS, c.after, c.after.replace('"size": 1000', '"size": 2000'));
  assert.deepEqual(size.readIt, [`${LIMITS}: perf.size changed in a way no rule judges`]);
  const blocking = modified(
    LIMITS,
    c.after,
    c.after.replace('"blocking": false', '"blocking": true'),
  );
  assert.deepEqual(blocking.readIt, [`${LIMITS}: perf.blocking changed in a way no rule judges`]);
  assert.deepEqual(blocking.tighter, []);
});

test("US-QG-07: a new key in a limits file that no rule reads is read it", () => {
  const c = FX["bundle-ceiling-raised"];
  const data = JSON.parse(c.after);
  data.maxFoo = 5;
  const j = modified(LIMITS, c.after, JSON.stringify(data));
  assert.deepEqual(j.readIt, [`${LIMITS}: maxFoo added or removed`]);
});

test("US-QG-07: a text that does not parse is read it, never tighter", () => {
  const c = FX["bundle-ceiling-raised"];
  const j = modified(LIMITS, c.before, "{ not json");
  assert.deepEqual(j.readIt, [`${LIMITS}: it is not JSON, so read it`]);
  assert.equal(directionOf([j]).verdict, "read it");
});

test("US-QG-07: an allowlist entry with a field the check does not read, or listed twice, is read it", () => {
  const c = FX["allowlist-advisories-swapped"];
  const extra = JSON.parse(c.after);
  extra.entries[0].scope = "dev";
  assert.match(
    modified(AUDIT, c.after, JSON.stringify(extra)).readIt[0],
    /an entry has the field scope, so read it/,
  );
  const twice = JSON.parse(c.after);
  twice.entries.push({ ...twice.entries[0] });
  assert.match(
    modified(AUDIT, c.after, JSON.stringify(twice)).readIt[0],
    /listed twice, so read it/,
  );
});

test("US-QG-07: a version that cannot be read is read it, never tighter or unchanged", () => {
  const c = FX["bundle-ceiling-raised"];
  const j = classifyFile({
    path: LIMITS,
    status: "modified",
    before: { error: "HTTP 500" },
    after: { text: c.after },
  });
  assert.equal(j.readIt.length, 1);
  assert.match(j.readIt[0], /its text cannot be read \(HTTP 500\), so read it/);
  assert.equal(directionOf([j]).verdict, "read it");
});

const UNKNOWN_GATE_FILES = [
  ".github/workflows/ci.yml",
  "Makefile",
  ".claude/hooks/rules.mjs",
  ".claude/settings.json",
  ".githooks/pre-push",
  "app/tools/check/quality/x.mjs",
  "app/config/project/release.config.js",
  "app/config/gates/new-limits.json",
  "app/eslint.config.js",
  "app/packages/web/vitest.config.ts",
];

for (const path of UNKNOWN_GATE_FILES) {
  test(`US-QG-07: ${path} is read it, never classified as tighter or unchanged`, () => {
    const same = classifyFile({
      path,
      status: "modified",
      before: { text: "same" },
      after: { text: "same" },
    });
    const changed = classifyFile({
      path,
      status: "modified",
      before: { text: "a" },
      after: { text: "b" },
    });
    const unread = classifyFile({ path, status: "modified" });
    for (const j of [same, changed, unread]) {
      assert.equal(directionOf([j]).verdict, "read it", path);
      assert.equal(j.tighter.length, 0, path);
      assert.equal(j.readIt.length, 1, path);
    }
  });
}

test("US-QG-07: a removed or renamed gate file is read it, and so is an added allowlist", () => {
  assert.deepEqual(classifyFile({ path: LIMITS, status: "removed" }).readIt, [
    `${LIMITS}: the file is removed`,
  ]);
  assert.equal(directionOf([classifyFile({ path: AUDIT, status: "renamed" })]).verdict, "read it");
  assert.equal(directionOf([classifyFile({ path: AUDIT, status: "added" })]).verdict, "read it");
});

test("US-QG-07: a new baseline file is looser, as baseline-growth.mjs counts it", () => {
  const j = classifyFile({ path: "app/config/gates/baselines/new-baseline.json", status: "added" });
  assert.deepEqual(j.looser, [
    "app/config/gates/baselines/new-baseline.json: a new baseline file, which baseline-growth.mjs counts as growth",
  ]);
  assert.equal(directionOf([j]).verdict, "looser");
});

test("US-QG-07: a baseline of an unknown format is read it, never tighter", () => {
  const path = "app/config/gates/baselines/unknown-baseline.json";
  const j = modified(path, '{"entries":[{"x":1}]}', '{"entries":[]}');
  assert.equal(directionOf([j]).verdict, "read it");
  assert.equal(j.tighter.length, 0);
});

test("US-QG-07: a text is read only for a modified file that a rule judges", () => {
  assert.equal(needsText(LIMITS, "modified"), true);
  assert.equal(needsText(AUDIT, "modified"), true);
  assert.equal(needsText("app/config/gates/baselines/one-screen-baseline.json", "modified"), true);
  assert.equal(needsText("Makefile", "modified"), false);
  assert.equal(needsText(LIMITS, "added"), false);
  assert.equal(needsText("app/config/gates/baselines/new.json", "added"), false);
});

test("US-QG-07: a proven looser change outranks read it, and read it outranks tighter only", () => {
  const looser = { looser: ["a"], tighter: [], readIt: ["b"] };
  const readIt = { looser: [], tighter: ["c"], readIt: ["b"] };
  const tighter = { looser: [], tighter: ["c"], readIt: [] };
  assert.equal(directionOf([looser]).verdict, "looser");
  assert.equal(directionOf([readIt]).verdict, "read it");
  assert.equal(directionOf([tighter]).verdict, "tighter only");
  assert.equal(directionOf([{ looser: [], tighter: [], readIt: [] }]).verdict, "unchanged");
  assert.equal(directionOf([]).verdict, "unchanged");
});
