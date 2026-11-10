// FR-DEV-10: create, check and sync of issue labels and board fields, with an injected gh client (no GitHub access)
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkIssue, createIssue, IssueRefused, syncIssue } from "./issue.mjs";
import { loadTaxonomy, main } from "./issue-cli.mjs";

// Folders this file makes are removed after it, also when a test fails (#1278).
const madeDirs = [];
after(() => {
  for (const dir of madeDirs) rmSync(dir, { recursive: true, force: true });
});
function tempDir(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  madeDirs.push(dir);
  return dir;
}

const taxonomy = {
  types: [
    { label: "story", typ: "Story" },
    { label: "bug", typ: "Bug" },
    { label: "epic", typ: "Epic" },
  ],
  epics: [
    { code: "ACC", label: "epic:ACC" },
    { code: "DEV", label: "epic:DEV" },
  ],
  priorities: ["P0", "P1", "P2", "P3"],
  // R5 is allowed for RELEASE= but has no option on the board below: a write to it fails after the issue is created.
  releases: [
    { code: "R1" },
    { code: "R2" },
    { code: "R3" },
    { code: "R4" },
    { code: "R5" },
    { code: "S2", option: "Stufe 2" },
  ],
};

const board = {
  fields: [
    {
      id: "FT",
      name: "Typ",
      options: [
        { id: "OT-S", name: "Story" },
        { id: "OT-B", name: "Bug" },
        { id: "OT-E", name: "Epic" },
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
    {
      id: "FP",
      name: "Priority",
      options: [
        { id: "OP-0", name: "P0 critical" },
        { id: "OP-1", name: "P1 high" },
        { id: "OP-2", name: "P2 normal" },
        { id: "OP-3", name: "P3 low" },
      ],
    },
    {
      id: "FR",
      name: "Release",
      options: [
        { id: "OR-1", name: "R1 Parität" },
        { id: "OR-2", name: "R2 Soziales" },
        { id: "OR-3", name: "R3 Tausch und Erinnerungen" },
        { id: "OR-4", name: "R4 KI-Zugang" },
        { id: "OR-S", name: "Stufe 2 – Öffnung für Externe" },
      ],
    },
    {
      id: "FS",
      name: "Status",
      options: [
        { id: "OS-T", name: "Todo" },
        { id: "OS-I", name: "In Progress" },
        { id: "OS-V", name: "On dev" },
        { id: "OS-D", name: "Done" },
      ],
    },
  ],
};

const REPO = "PflanzenDex/PflanzenDex";

/** The field metadata of the project (board-client.mjs projectMeta, one GraphQL query): answered for every test. */
const META = {
  data: { organization: { projectV2: { id: "PROJ", fields: { nodes: board.fields } } } },
};

/**
 * Fake gh: answers by the start of the command line and records every call. The field metadata query is answered by META,
 * or by answers.meta (an error, for a board that cannot be reached).
 */
function fakeGh(answers = {}) {
  const calls = [];
  return {
    calls,
    async run(cmd, args) {
      const line = `${cmd} ${args.join(" ")}`;
      calls.push(line);
      const hit = line.includes("fields(first")
        ? ["meta", answers.meta ?? META]
        : Object.entries(answers).find(([prefix]) => line.startsWith(prefix));
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
const boardAnswers = { "gh project item-add": { id: "ITEM" } };
/** The REST create of an issue (claim-client createIssueRest, FR-DEV-10 #1412): issue number n. */
const created = (n) => ({
  "gh api -X POST repos/PflanzenDex/PflanzenDex/issues": {
    number: n,
    html_url: `https://github.com/PflanzenDex/PflanzenDex/issues/${n}`,
  },
});
const quiet = () => {};

/** Answer of the one-issue status query (board-client.mjs boardItemOf): the issue's project items, aliased fields. */
const itemOnBoard = (status, project = 2) => ({
  id: "ITEM",
  project: { number: project, owner: { login: "PflanzenDex" } },
  status: status ? { name: status } : null,
});
const issueOnBoard = (...nodes) => ({
  data: { repository: { issue: { projectItems: { nodes } } } },
});

function tempOutput() {
  return path.join(tempDir("issue-test-"), "output");
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

test("FR-DEV-10 (e): make issue creates the issue with both labels and sets Typ, Epic, Priority, Release and Status Todo on the board", async () => {
  const client = fakeGh({ ...boardAnswers, ...created(1230) });
  const logs = [];
  const result = await createIssue(
    client,
    { type: "story", epic: "ACC", priority: "P1", title: "T", body: "B" },
    { taxonomy, env: { GH_REPO: REPO }, log: (l) => logs.push(l) },
  );
  assert.deepEqual(result, {
    number: 1230,
    url: "https://github.com/PflanzenDex/PflanzenDex/issues/1230",
    board: "set",
  });
  const create = client.calls.find((c) => c.startsWith("gh api -X POST"));
  assert.match(create, /-f labels\[\]=story -f labels\[\]=epic:ACC/);
  const edits = client.calls.filter((c) => c.startsWith("gh project item-edit"));
  assert.equal(edits.length, 5);
  assert.match(edits[0], /--field-id FT --single-select-option-id OT-S/);
  assert.match(edits[1], /--field-id FE --single-select-option-id OE-ACC/);
  assert.match(edits[2], /--field-id FP --single-select-option-id OP-1/);
  assert.match(edits[3], /--field-id FR --single-select-option-id OR-2/);
  assert.match(edits[4], /--field-id FS --single-select-option-id OS-T/);
  assert.ok(logs.some((l) => /Created #1230/.test(l)));
  assert.ok(
    logs.some((l) => /Board: Typ Story, Epic ACC, Priority P1, Release R2, Status Todo/.test(l)),
  );
});

test("FR-DEV-10: make issue sets the Release by the rule on the board: a bug by its priority, a story R2, an epic none", async () => {
  const cases = [
    ["bug", "DEV", "P0", "OR-1"],
    ["bug", "DEV", "P1", "OR-1"],
    ["bug", "DEV", "P2", "OR-2"],
    ["bug", "DEV", "P3", "OR-4"],
    ["story", "ACC", "P1", "OR-2"],
    ["epic", "DEV", "P1", null],
  ];
  for (const [type, epic, priority, option] of cases) {
    const client = fakeGh({ ...boardAnswers, ...created(1240) });
    await createIssue(
      client,
      { type, epic, priority, title: "T", body: "B" },
      { taxonomy, env: { GH_REPO: REPO }, log: quiet },
    );
    const release = client.calls.find((c) => c.includes("--field-id FR "));
    if (option) assert.equal(release?.split(" ").pop(), option, type);
    else assert.equal(release, undefined, `${type} gets no Release`);
  }
});

test("FR-DEV-10: a RELEASE override is written to the board, also for an epic, and the stage 2 release by its code", async () => {
  const cases = [
    ["epic", "DEV", "P1", "R3", "OR-3"],
    ["bug", "DEV", "P0", "S2", "OR-S"],
  ];
  for (const [type, epic, priority, release, option] of cases) {
    const client = fakeGh({ ...boardAnswers, ...created(1241) });
    const logs = [];
    await createIssue(
      client,
      { type, epic, priority, release, title: "T", body: "B" },
      { taxonomy, env: { GH_REPO: REPO }, log: (l) => logs.push(l) },
    );
    const edit = client.calls.find((c) => c.includes("--field-id FR "));
    assert.equal(edit?.split(" ").pop(), option, release);
    assert.ok(
      logs.some((l) => /Release/.test(l)),
      release,
    );
  }
});

test("FR-DEV-10: make issue --release R3 reaches the board write through the command line, an unknown RELEASE is refused before creation", async () => {
  const client = fakeGh({ ...boardAnswers, ...created(1242) });
  const args = ["create", "--type", "story", "--epic", "ACC", "--priority", "P1", "--title", "T"];
  const body = path.join(tempDir("issue-test-"), "body.md");
  writeFileSync(body, "## Story\n");
  const code = await main([...args, "--body-file", body, "--release", "R3"], {
    client,
    taxonomy,
    env: { GH_REPO: REPO },
    log: quiet,
  });
  assert.equal(code, 0);
  assert.ok(client.calls.some((c) => c.includes("--field-id FR") && c.endsWith("OR-3")));
  const refused = fakeGh({ ...boardAnswers, ...created(1243) });
  await assert.rejects(
    main([...args, "--body-file", body, "--release", "R9"], {
      client: refused,
      taxonomy,
      env: { GH_REPO: REPO },
      log: quiet,
    }),
    (e) => e instanceof IssueRefused && /unknown release "R9"/.test(e.message),
  );
  assert.equal(refused.calls.length, 0, "nothing is created for an unknown RELEASE");
});

test("FR-DEV-10: a failed Release write after the other fields were set is reported with the fields that are set and the one that is not", async () => {
  const client = fakeGh({
    ...boardAnswers,
    ...created(1244),
    "gh project item-edit": (line) =>
      line.includes("--field-id FR ") ? new Error("GraphQL: Resource not accessible") : "",
  });
  const logs = [];
  const result = await createIssue(
    client,
    { type: "story", epic: "ACC", priority: "P1", title: "T", body: "B" },
    { taxonomy, env: { GH_REPO: REPO }, log: (l) => logs.push(l) },
  );
  assert.equal(result.board, "missing");
  assert.ok(
    logs.some((l) =>
      /WARNING: #1244 is created, but only some of its board fields are set \(GraphQL: Resource not accessible\)\./.test(
        l,
      ),
    ),
  );
  assert.ok(logs.some((l) => l === "  Set: Typ Story, Epic ACC, Priority P1."));
  assert.ok(logs.some((l) => l === "  Not set yet: Release R2, Status Todo."));
  assert.ok(
    !client.calls.some((c) => c.includes("--field-id FS ")),
    "the Status is not written after the failed Release",
  );
});

test("FR-DEV-10: a Release the board has no option for is reported after the issue is created, and nothing is written to the board", async () => {
  const client = fakeGh({ ...boardAnswers, ...created(1245) });
  const logs = [];
  const result = await createIssue(
    client,
    { type: "story", epic: "ACC", priority: "P1", release: "R5", title: "T", body: "B" },
    { taxonomy, env: { GH_REPO: REPO }, log: (l) => logs.push(l) },
  );
  assert.equal(result.board, "missing");
  assert.ok(
    client.calls.some((c) => c.startsWith("gh api -X POST")),
    "the issue is created first",
  );
  assert.ok(
    !client.calls.some((c) => c.startsWith("gh project item-add")),
    "nothing is written to the board",
  );
  assert.ok(
    logs.some((l) =>
      /WARNING: #1245 is created, but its board fields are NOT set \(project field "Release" has no option for "R5"\)\./.test(
        l,
      ),
    ),
  );
  assert.ok(
    logs.some(
      (l) => l === "  Not set yet: Typ Story, Epic ACC, Priority P1, Release R5, Status Todo.",
    ),
  );
});

test("FR-DEV-10 (#1412): a board that cannot be reached is a warning, the issue stays, exit 0, and it says what is missing", async () => {
  const client = fakeGh({
    ...created(1231),
    meta: new Error("GraphQL: API rate limit already exceeded for user ID 1."),
  });
  const logs = [];
  const result = await createIssue(
    client,
    { type: "bug", epic: "DEV", priority: "P1", title: "T", body: "B" },
    { taxonomy, env: { GH_REPO: REPO }, log: (l) => logs.push(l) },
  );
  assert.deepEqual(result, {
    number: 1231,
    url: "https://github.com/PflanzenDex/PflanzenDex/issues/1231",
    board: "missing",
  });
  assert.match(
    client.calls[0],
    /^gh api -X POST repos\/PflanzenDex\/PflanzenDex\/issues/,
    "REST create comes first",
  );
  assert.ok(
    logs.some((l) =>
      /WARNING: #1231 is created, but its board fields are NOT set \(GraphQL: API rate limit/.test(
        l,
      ),
    ),
  );
  assert.ok(
    logs.some((l) =>
      /Not set yet: Typ Bug, Epic DEV, Priority P1, Release R1, Status Todo\./.test(l),
    ),
  );
  assert.ok(logs.some((l) => /CI does not set Priority or Release/.test(l)));
  assert.ok(
    !client.calls.some((c) => c.startsWith("gh project item-add")),
    "nothing is written to the board",
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
  const body = path.join(tempDir("issue-test-"), "body.md");
  writeFileSync(body, "## Story\n\nText\n");
  const client = fakeGh({ ...boardAnswers, ...created(1232) });
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
    client.calls.find((c) => c.startsWith("gh api -X POST") && c.includes("-f body=## Story")),
  );
});

test("FR-DEV-10 (b): sync sets Typ and Epic on the board from the type label and the epic code", async () => {
  const client = fakeGh({
    ...boardAnswers,
    "gh api graphql": issueOnBoard(itemOnBoard("In Progress")),
  });
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
  const client = fakeGh({ ...boardAnswers, "gh api graphql": issueOnBoard() });
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

test("FR-DEV-10 (e): sync sets Status Todo when the item has no Status yet, also when it is not on the board", async () => {
  const cases = [
    ["not on the board", issueOnBoard()],
    ["on the board without a Status", issueOnBoard(itemOnBoard(null))],
    ["a Status only in another project", issueOnBoard(itemOnBoard("Done", 9))],
  ];
  for (const [label, answer] of cases) {
    const client = fakeGh({ ...boardAnswers, "gh api graphql": answer });
    await syncIssue(client, 12, {
      type: "bug",
      epic: "DEV",
      taxonomy,
      env: { GH_REPO: REPO },
      log: quiet,
    });
    const edits = client.calls.filter((c) => c.startsWith("gh project item-edit"));
    assert.equal(edits.length, 3, label);
    assert.match(edits[2], /--field-id FS --single-select-option-id OS-T/, label);
    // one issue is read, never the whole board
    assert.ok(
      client.calls.some((c) => c.startsWith("gh api graphql") && c.includes("-F number=12")),
      label,
    );
    assert.ok(!client.calls.some((c) => c.startsWith("gh project item-list")), label);
  }
});

test("FR-DEV-10 (e): sync never overwrites an existing Status (In Progress, On dev, Done)", async () => {
  for (const status of ["In Progress", "On dev", "Done"]) {
    const client = fakeGh({
      ...boardAnswers,
      "gh api graphql": issueOnBoard(itemOnBoard(status)),
    });
    const fields = await syncIssue(client, 12, {
      type: "bug",
      epic: "DEV",
      taxonomy,
      env: { GH_REPO: REPO },
      log: quiet,
    });
    const edits = client.calls.filter((c) => c.startsWith("gh project item-edit"));
    assert.equal(edits.length, 2, status);
    assert.ok(!edits.some((c) => c.includes("--field-id FS ")), status);
    assert.deepEqual(fields, { Typ: "Bug", Epic: "DEV" }, status);
  }
});

test("FR-DEV-10 (e): sync still sets Typ and Epic when the Status cannot be read, and warns instead of aborting", async () => {
  const client = fakeGh({
    ...boardAnswers,
    "gh api graphql": new Error("GraphQL: Resource not accessible by integration"),
  });
  const logs = [];
  const fields = await syncIssue(client, 12, {
    type: "bug",
    epic: "DEV",
    taxonomy,
    env: { GH_REPO: REPO },
    log: (l) => logs.push(l),
  });
  const edits = client.calls.filter((c) => c.startsWith("gh project item-edit"));
  assert.equal(edits.length, 2);
  assert.match(edits[0], /--field-id FT --single-select-option-id OT-B/);
  assert.match(edits[1], /--field-id FE --single-select-option-id OE-DEV/);
  assert.ok(!edits.some((c) => c.includes("--field-id FS ")), "an unknown Status is not written");
  assert.deepEqual(fields, { Typ: "Bug", Epic: "DEV" });
  assert.deepEqual(logs, [
    "#12 board: Status not read (GraphQL: Resource not accessible by integration); Typ/Epic set, Status left as is",
  ]);
});

test("FR-DEV-10: the usage of a mode is a usage error (exit 2 in the CLI)", async () => {
  await assert.rejects(main(["nope"], { client: fakeGh(), taxonomy, log: quiet }), /usage/);
  await assert.rejects(
    main(["check", "--issue", "abc"], { client: fakeGh(), taxonomy, log: quiet }),
    /--issue/,
  );
});

test("FR-DEV-10: the allowed list in app/config/project holds the five types and the 24 epics (22 product and process epics, E and TE), and no MIG", () => {
  const file = loadTaxonomy();
  assert.deepEqual(
    file.types.map((t) => t.label),
    ["story", "enabler", "bug", "epic", "entscheidung"],
  );
  assert.deepEqual(
    file.types.map((t) => t.typ),
    ["Story", "Enabler", "Bug", "Epic", "Entscheidung"],
  );
  assert.equal(file.epics.length, 24);
  for (const epic of file.epics) assert.equal(epic.label, `epic:${epic.code}`);
  assert.equal(new Set(file.epics.map((e) => e.code)).size, 24);
  assert.ok(!file.epics.some((e) => e.code === "MIG" || e.label === "epic:MIG"));
  assert.deepEqual(file.priorities, ["P0", "P1", "P2", "P3"]);
  assert.deepEqual(
    file.releases.map((r) => r.code),
    ["R0", "R1", "R2", "R3", "R4", "R5", "R6", "S2"],
  );
  assert.equal(file.releases.find((r) => r.code === "S2").option, "Stufe 2");
});

test("FR-DEV-10: sync never writes the Release, so a Release set by hand on the board is kept", async () => {
  const client = fakeGh({
    ...boardAnswers,
    "gh api graphql": issueOnBoard(itemOnBoard("In Progress")),
  });
  await syncIssue(client, 12, {
    type: "bug",
    epic: "DEV",
    taxonomy,
    env: { GH_REPO: REPO },
    log: quiet,
  });
  assert.ok(!client.calls.some((c) => c.includes("--field-id FR ")));
});
