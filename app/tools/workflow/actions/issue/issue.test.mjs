// FR-DEV-10: create, check and sync of issue labels and board fields, with an injected gh client (no GitHub access)
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkIssue, createIssue, IssueRefused, syncIssue } from "./issue.mjs";
import { loadTaxonomy, main } from "./issue-cli.mjs";

const taxonomy = {
  types: [
    { label: "story", typ: "Story" },
    { label: "bug", typ: "Bug" },
  ],
  epics: [
    { code: "ACC", label: "epic:ACC" },
    { code: "DEV", label: "epic:DEV" },
  ],
  priorities: ["P0", "P1"],
};

const board = {
  fields: [
    {
      id: "FT",
      name: "Typ",
      options: [
        { id: "OT-S", name: "Story" },
        { id: "OT-B", name: "Bug" },
      ],
    },
    {
      id: "FE",
      name: "Epic",
      options: [
        { id: "OE-ACC", name: "ACC · Accounts" },
        { id: "OE-DEV", name: "DEV · Process" },
      ],
    },
    { id: "FP", name: "Priority", options: [{ id: "OP-1", name: "P1 high" }] },
  ],
};

const REPO = "PflanzenDex/PflanzenDex";

/** Fake gh: answers by the start of the command line and records every call. */
function fakeGh(answers = {}) {
  const calls = [];
  return {
    calls,
    async run(cmd, args) {
      const line = `${cmd} ${args.join(" ")}`;
      calls.push(line);
      const hit = Object.entries(answers).find(([prefix]) => line.startsWith(prefix));
      if (!hit) return "";
      const value = typeof hit[1] === "function" ? hit[1](line) : hit[1];
      if (value instanceof Error) throw value;
      return typeof value === "string" ? value : JSON.stringify(value);
    },
  };
}

const issueWith = (names) => ({
  "gh issue view": { number: 12, labels: names.map((name) => ({ name })) },
});
const boardAnswers = {
  "gh project field-list": board,
  "gh project item-add": { id: "ITEM" },
  "gh project view": { id: "PROJ" },
};
const quiet = () => {};

function tempOutput() {
  return path.join(mkdtempSync(path.join(tmpdir(), "issue-test-")), "output");
}

test("FR-DEV-10 (a): an opened issue without an epic label gets a comment and needs-triage, nothing else", async () => {
  const client = fakeGh(issueWith(["bug"]));
  const output = tempOutput();
  const result = await checkIssue(client, 12, { event: "opened", taxonomy, output, log: quiet });
  assert.equal(result.valid, false);
  assert.ok(
    client.calls.some(
      (c) => c.startsWith("gh issue comment 12") && /Missing: an epic label/.test(c),
    ),
  );
  assert.ok(client.calls.some((c) => c === "gh issue edit 12 --add-label=needs-triage"));
  assert.ok(!client.calls.some((c) => c.includes("--remove-label")));
  assert.ok(!client.calls.some((c) => c.startsWith("gh project")));
  assert.equal(readFileSync(output, "utf8"), "valid=false\n");
});

test("FR-DEV-10 (a): a plain edit of an already flagged invalid issue stays quiet", async () => {
  const client = fakeGh(issueWith(["bug", "needs-triage"]));
  await checkIssue(client, 12, { event: "edited", taxonomy, log: quiet });
  assert.ok(!client.calls.some((c) => c.startsWith("gh issue comment")));
  assert.ok(!client.calls.some((c) => c.includes("--add-label")));
});

test("FR-DEV-10 (b): valid labels remove needs-triage and write type and epic for the board step", async () => {
  const client = fakeGh(issueWith(["story", "epic:ACC", "needs-triage"]));
  const output = tempOutput();
  const result = await checkIssue(client, 12, { event: "labeled", taxonomy, output, log: quiet });
  assert.deepEqual(result, { valid: true, type: "story", epic: "ACC" });
  assert.ok(client.calls.some((c) => c === "gh issue edit 12 --remove-label=needs-triage"));
  assert.ok(!client.calls.some((c) => c.startsWith("gh issue comment")));
  assert.equal(readFileSync(output, "utf8"), "valid=true\ntype=story\nepic=ACC\n");
});

test("FR-DEV-10: a valid issue without needs-triage is left alone", async () => {
  const client = fakeGh(issueWith(["story", "epic:ACC"]));
  const result = await checkIssue(client, 12, { event: "opened", taxonomy, log: quiet });
  assert.equal(result.valid, true);
  assert.equal(client.calls.filter((c) => c.startsWith("gh issue")).length, 1);
});

test("FR-DEV-10: report issues are not checked and get no writes", async () => {
  const client = fakeGh(issueWith(["report"]));
  const result = await checkIssue(client, 12, { event: "opened", taxonomy, log: quiet });
  assert.deepEqual(result, { valid: false, skipped: true });
  assert.equal(client.calls.length, 1);
});

test("FR-DEV-10 (c): make issue with an unknown type writes nothing on GitHub", async () => {
  const client = fakeGh();
  await assert.rejects(
    createIssue(
      client,
      { type: "task", epic: "ACC", priority: "P1", title: "x", body: "y" },
      { taxonomy, env: { GH_REPO: REPO }, log: quiet },
    ),
    (e) => e instanceof IssueRefused && /unknown type "task"/.test(e.message),
  );
  assert.equal(client.calls.length, 0);
});

test("FR-DEV-10: make issue creates the issue with both labels and sets Typ, Epic and Priority on the board", async () => {
  const client = fakeGh({
    ...boardAnswers,
    "gh issue create": "https://github.com/PflanzenDex/PflanzenDex/issues/1230\n",
  });
  const logs = [];
  const result = await createIssue(
    client,
    { type: "story", epic: "ACC", priority: "P1", title: "T", body: "B" },
    { taxonomy, env: { GH_REPO: REPO }, log: (l) => logs.push(l) },
  );
  assert.deepEqual(result, {
    number: 1230,
    url: "https://github.com/PflanzenDex/PflanzenDex/issues/1230",
  });
  const create = client.calls.find((c) => c.startsWith("gh issue create"));
  assert.match(create, /--label=story --label=epic:ACC/);
  const edits = client.calls.filter((c) => c.startsWith("gh project item-edit"));
  assert.equal(edits.length, 3);
  assert.match(edits[0], /--field-id FT --single-select-option-id OT-S/);
  assert.match(edits[1], /--field-id FE --single-select-option-id OE-ACC/);
  assert.match(edits[2], /--field-id FP --single-select-option-id OP-1/);
  assert.ok(logs.some((l) => /Created #1230/.test(l)));
});

test("FR-DEV-10: a failed board write after the issue exists says how to repair it, nothing is hidden", async () => {
  const client = fakeGh({
    "gh issue create": "https://github.com/PflanzenDex/PflanzenDex/issues/1231\n",
    "gh project field-list": new Error("gh project unavailable"),
  });
  await assert.rejects(
    createIssue(
      client,
      { type: "bug", epic: "DEV", priority: "P1", title: "T", body: "B" },
      { taxonomy, env: { GH_REPO: REPO }, log: quiet },
    ),
    (e) =>
      /#1231 was created with its labels/.test(e.message) &&
      /make issue-sync ISSUE=1231 TYPE=bug EPIC=DEV/.test(e.message),
  );
});

test("FR-DEV-10: make issue refuses an unreadable body file before anything is created", async () => {
  const client = fakeGh();
  await assert.rejects(
    main(
      [
        "create",
        "--type",
        "story",
        "--epic",
        "ACC",
        "--priority",
        "P1",
        "--title",
        "T",
        "--body-file",
        "/no/such/body.md",
      ],
      { client, taxonomy, env: { GH_REPO: REPO }, log: quiet },
    ),
    (e) => e instanceof IssueRefused && /cannot read the body file/.test(e.message),
  );
  assert.equal(client.calls.length, 0);
});

test("FR-DEV-10: make issue reads the body file and creates the issue", async () => {
  const body = path.join(mkdtempSync(path.join(tmpdir(), "issue-test-")), "body.md");
  writeFileSync(body, "## Story\n\nText\n");
  const client = fakeGh({
    ...boardAnswers,
    "gh issue create": "https://github.com/PflanzenDex/PflanzenDex/issues/1232\n",
  });
  const code = await main(
    [
      "create",
      "--type",
      "story",
      "--epic",
      "ACC",
      "--priority",
      "P1",
      "--title",
      "T",
      "--body-file",
      body,
    ],
    { client, taxonomy, env: { GH_REPO: REPO }, log: quiet },
  );
  assert.equal(code, 0);
  assert.ok(
    client.calls.find((c) => c.startsWith("gh issue create") && c.includes("--body=## Story")),
  );
});

test("FR-DEV-10 (b): sync sets Typ and Epic on the board from the type label and the epic code", async () => {
  const client = fakeGh({ ...boardAnswers });
  await syncIssue(client, 12, {
    type: "bug",
    epic: "DEV",
    taxonomy,
    env: { GH_REPO: REPO },
    log: quiet,
  });
  const edits = client.calls.filter((c) => c.startsWith("gh project item-edit"));
  assert.equal(edits.length, 2);
  assert.match(edits[0], /--field-id FT --single-select-option-id OT-B/);
  assert.match(edits[1], /--field-id FE --single-select-option-id OE-DEV/);
  assert.ok(
    client.calls.some((c) =>
      c.startsWith(
        "gh project item-add 2 --owner PflanzenDex --url https://github.com/PflanzenDex/PflanzenDex/issues/12",
      ),
    ),
  );
});

test("FR-DEV-10: sync refuses an unknown epic before it writes to the board", async () => {
  const client = fakeGh({ ...boardAnswers });
  await assert.rejects(
    syncIssue(client, 12, {
      type: "story",
      epic: "MIG",
      taxonomy,
      env: { GH_REPO: REPO },
      log: quiet,
    }),
    (e) => e instanceof IssueRefused,
  );
  assert.equal(client.calls.length, 0);
});

test("FR-DEV-10: a board option that does not exist fails the sync and writes no field", async () => {
  const client = fakeGh({ ...boardAnswers });
  await assert.rejects(
    syncIssue(client, 12, {
      type: "story",
      epic: "QS",
      taxonomy: { ...taxonomy, epics: [...taxonomy.epics, { code: "QS", label: "epic:QS" }] },
      env: { GH_REPO: REPO },
      log: quiet,
    }),
    /has no option for "QS"/,
  );
  assert.ok(!client.calls.some((c) => c.startsWith("gh project item-edit")));
});

test("FR-DEV-10: the usage of a mode is a usage error (exit 2 in the CLI)", async () => {
  await assert.rejects(main(["nope"], { client: fakeGh(), taxonomy, log: quiet }), /usage/);
  await assert.rejects(
    main(["check", "--issue", "abc"], { client: fakeGh(), taxonomy, log: quiet }),
    /--issue/,
  );
});

test("FR-DEV-10: the allowed list in app/config/project holds the five types and the 21 epics (19 product and process epics, E and TE), and no MIG", () => {
  const file = loadTaxonomy();
  assert.deepEqual(
    file.types.map((t) => t.label),
    ["story", "enabler", "bug", "epic", "entscheidung"],
  );
  assert.deepEqual(
    file.types.map((t) => t.typ),
    ["Story", "Enabler", "Bug", "Epic", "Entscheidung"],
  );
  assert.equal(file.epics.length, 21);
  for (const epic of file.epics) assert.equal(epic.label, `epic:${epic.code}`);
  assert.equal(new Set(file.epics.map((e) => e.code)).size, 21);
  assert.ok(!file.epics.some((e) => e.code === "MIG" || e.label === "epic:MIG"));
  assert.deepEqual(file.priorities, ["P0", "P1", "P2", "P3"]);
});
