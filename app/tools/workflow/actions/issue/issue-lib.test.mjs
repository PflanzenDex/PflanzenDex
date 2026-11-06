// FR-DEV-10: the rules of the issue labels (type, epic, board options, comment, make issue input, Release)
import test from "node:test";
import assert from "node:assert/strict";
import {
  boardFieldsFor,
  commentBody,
  findOption,
  issueNumberOf,
  shouldComment,
  validateLabels,
  validateNewIssue,
} from "./issue-lib.mjs";
import { loadTaxonomy } from "./issue-cli.mjs";

const taxonomy = {
  types: [
    { label: "story", typ: "Story" },
    { label: "bug", typ: "Bug" },
  ],
  epics: [
    { code: "ACC", label: "epic:ACC" },
    { code: "DEV", label: "epic:DEV" },
    { code: "E", label: "epic:E", option: "Entscheidungen" },
  ],
  priorities: ["P0", "P1"],
  releases: [
    { code: "R1" },
    { code: "R2" },
    { code: "R3" },
    { code: "R4" },
    { code: "R5" },
    { code: "S2", option: "Stufe 2" },
  ],
};

/** The allowed list as it is in the repository: the rule of Release is checked against it, not against a copy. */
const real = loadTaxonomy();

test("FR-DEV-10: a type label and an epic label from the list are valid and give the board values", () => {
  const verdict = validateLabels(["story", "epic:ACC"], taxonomy);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.typeLabel, "story");
  assert.equal(verdict.epicCode, "ACC");
  assert.deepEqual(verdict.fields, { Typ: "Story", Epic: "ACC" });
});

test("FR-DEV-10: a missing type or epic label is named as missing and is invalid", () => {
  assert.deepEqual(validateLabels(["bug"], taxonomy).missing, ["epic"]);
  assert.deepEqual(validateLabels(["epic:DEV"], taxonomy).missing, ["type"]);
  const none = validateLabels([], taxonomy);
  assert.equal(none.ok, false);
  assert.deepEqual(none.missing, ["type", "epic"]);
  assert.equal(none.fields, null);
});

test("FR-DEV-10: an epic label outside the list (epic:MIG, epic:FOO) is unknown and invalid", () => {
  const retired = validateLabels(["story", "epic:ACC", "epic:MIG"], taxonomy);
  assert.equal(retired.ok, false);
  assert.deepEqual(retired.unknown, ["epic:MIG"]);
  assert.deepEqual(validateLabels(["story", "epic:FOO"], taxonomy).unknown, ["epic:FOO"]);
});

test("FR-DEV-10: two type labels or two epic labels are invalid, both named", () => {
  const verdict = validateLabels(["story", "bug", "epic:ACC", "epic:DEV"], taxonomy);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.multiple, ["story", "bug", "epic:ACC", "epic:DEV"]);
});

test("FR-DEV-10: labels that are neither type nor epic labels (needs-triage, report, a priority) do not count", () => {
  const verdict = validateLabels(["story", "epic:ACC", "needs-triage", "report", "P1"], taxonomy);
  assert.equal(verdict.ok, true);
});

test("FR-DEV-10: the comment names what is missing and unknown, lists the allowed labels and says how to resolve it", () => {
  const verdict = validateLabels(["epic:MIG"], taxonomy);
  const text = commentBody(verdict, taxonomy);
  assert.match(text, /Missing: a type label/);
  assert.match(text, /Missing: an epic label/);
  assert.match(text, /Not allowed: `epic:MIG`/);
  assert.match(text, /`story`, `bug`/);
  assert.match(text, /`epic:ACC`, `epic:DEV`/);
  assert.match(text, /needs-triage/);
  assert.match(text, /issue-taxonomy\.json/);
});

test("FR-DEV-10: a comment is posted when an issue becomes invalid, not on every edit of a flagged one", () => {
  const invalid = validateLabels(["bug"], taxonomy);
  const valid = validateLabels(["bug", "epic:ACC"], taxonomy);
  assert.equal(shouldComment({ verdict: invalid, flagged: false, event: "opened" }), true);
  assert.equal(shouldComment({ verdict: invalid, flagged: true, event: "edited" }), false);
  assert.equal(shouldComment({ verdict: invalid, flagged: true, event: "labeled" }), true);
  assert.equal(shouldComment({ verdict: invalid, flagged: true, event: "unlabeled" }), true);
  assert.equal(shouldComment({ verdict: valid, flagged: false, event: "opened" }), false);
});

test("FR-DEV-10: board options are found by their name or by the code in front of the text", () => {
  const options = [
    { id: "1", name: "ACC · Accounts" },
    { id: "2", name: "ACCESS · Other" },
    { id: "3", name: "P1 high" },
    { id: "4", name: "Story" },
  ];
  assert.equal(findOption(options, "ACC").id, "1");
  assert.equal(findOption(options, "P1").id, "3");
  assert.equal(findOption(options, "Story").id, "4");
  assert.equal(findOption(options, "AC"), undefined);
  assert.deepEqual(boardFieldsFor(taxonomy, "bug", "DEV"), { Typ: "Bug", Epic: "DEV" });
  assert.equal(boardFieldsFor(taxonomy, "bug", "MIG"), null);
});

test("FR-DEV-10: make issue refuses an unknown type, epic or priority and says what is allowed", () => {
  const input = { type: "task", epic: "MIG", priority: "P9", title: "x", body: "text" };
  const plan = validateNewIssue(input, taxonomy);
  assert.equal(plan.ok, false);
  assert.equal(plan.errors.length, 3);
  assert.match(plan.errors[0], /unknown type "task"; allowed: story, bug/);
  assert.match(plan.errors[1], /unknown epic "MIG"; allowed: ACC, DEV/);
  assert.match(plan.errors[2], /unknown priority "P9"; allowed: P0, P1/);
});

test("FR-DEV-10: make issue refuses a missing or multi-line title and an empty body", () => {
  const plan = validateNewIssue(
    { type: "story", epic: "ACC", priority: "P1", title: " \n", body: "  " },
    taxonomy,
  );
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.errors, ["missing title", "the body file is empty"]);
  const two = validateNewIssue(
    { type: "story", epic: "ACC", priority: "P1", title: "a\nb", body: "x" },
    taxonomy,
  );
  assert.deepEqual(two.errors, ["the title must be one line"]);
});

test("FR-DEV-10: make issue accepts the input in any case and returns the labels and board values", () => {
  const plan = validateNewIssue(
    { type: "Story", epic: "acc", priority: "p1", title: " Delete specimen ", body: "# Body" },
    taxonomy,
  );
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.labels, ["story", "epic:ACC"]);
  assert.deepEqual(plan.fields, {
    Typ: "Story",
    Epic: "ACC",
    Priority: "P1",
    Release: "R2",
    Status: "Todo",
  });
  assert.equal(plan.title, "Delete specimen");
});

test("FR-DEV-10: make issue sets the Release by the rule: a bug by its priority (P0 and P1 R1, P2 R2, P3 R4), every other type R2, an epic none", () => {
  const release = (type, priority) =>
    validateNewIssue({ type, epic: "ACC", priority, title: "T", body: "B" }, real).fields.Release;
  for (const priority of ["P0", "P1"]) assert.equal(release("bug", priority), "R1", priority);
  assert.equal(release("bug", "P2"), "R2");
  assert.equal(release("bug", "P3"), "R4");
  for (const type of ["story", "enabler", "entscheidung"])
    for (const priority of ["P0", "P1", "P2", "P3"])
      assert.equal(release(type, priority), "R2", `${type} ${priority}`);
  for (const priority of ["P0", "P1", "P2", "P3"])
    assert.equal(release("epic", priority), undefined, `epic ${priority} has no Release`);
});

test("FR-DEV-10: a RELEASE override wins over the rule for every type, the epic included, and is case-insensitive", () => {
  const plan = (input) =>
    validateNewIssue({ epic: "ACC", priority: "P0", title: "T", body: "B", ...input }, real);
  assert.equal(plan({ type: "bug", release: "R3" }).fields.Release, "R3");
  assert.equal(plan({ type: "bug", release: "r3" }).fields.Release, "R3");
  assert.equal(plan({ type: "epic", release: "R5" }).fields.Release, "R5");
  assert.equal(plan({ type: "story", release: "S2" }).fields.Release, "Stufe 2");
  assert.equal(
    plan({ type: "bug", release: "" }).fields.Release,
    "R1",
    "an empty override is no override",
  );
});

test("FR-DEV-10: an unknown RELEASE is refused with the allowed codes, before anything is created", () => {
  const plan = validateNewIssue(
    { type: "bug", epic: "ACC", priority: "P1", release: "R9", title: "T", body: "B" },
    taxonomy,
  );
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.errors, ['unknown release "R9"; allowed: R1, R2, R3, R4, R5, S2']);
});

test("FR-DEV-10: the allowed list of issue-taxonomy.json holds the codes the rule gives (R1, R2, R4) and the codes RELEASE= accepts", () => {
  const codes = new Set(real.releases.map((r) => r.code));
  for (const code of ["R1", "R2", "R4"]) assert.ok(codes.has(code), code);
  for (const code of ["R0", "R1", "R2", "R3", "R4", "R5", "R6", "S2"])
    assert.ok(codes.has(code), `${code} is allowed for RELEASE=`);
});

test("FR-DEV-10: a board option is found by a multi-word key: Stufe 2 finds 'Stufe 2 – …', not 'Stufe 20 …'", () => {
  const options = [
    { id: "R2", name: "R2 Soziales" },
    { id: "S", name: "Stufe 2 – Öffnung für Externe" },
    { id: "T", name: "Stufe 20 – Anderes" },
  ];
  assert.equal(findOption(options, "Stufe 2").id, "S");
  assert.equal(findOption(options, "R2").id, "R2");
  assert.equal(findOption(options, "R"), undefined);
  assert.equal(findOption(options, "Stufe 3"), undefined);
});

test("FR-DEV-10: make issue sets an epic to its named board option (E: Entscheidungen), not to its code", () => {
  const plan = validateNewIssue(
    { type: "entscheidung", epic: "E", priority: "P1", title: "T", body: "B" },
    real,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.fields.Epic, "Entscheidungen");
});

test("FR-DEV-10: the issue number is read from the URL that gh prints", () => {
  assert.equal(issueNumberOf("https://github.com/PflanzenDex/PflanzenDex/issues/1230\n"), 1230);
  assert.throws(() => issueNumberOf("created"), /no issue number/);
});

test("FR-DEV-10: an epic whose board option does not start with its code uses its named option", () => {
  const verdict = validateLabels(["entscheidung", "epic:E"], {
    ...taxonomy,
    types: [...taxonomy.types, { label: "entscheidung", typ: "Entscheidung" }],
  });
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.fields, { Typ: "Entscheidung", Epic: "Entscheidungen" });
  const options = [
    { id: "9", name: "ENT · Entdecken" },
    { id: "8", name: "Entscheidungen" },
  ];
  assert.equal(findOption(options, verdict.fields.Epic).id, "8");
});
