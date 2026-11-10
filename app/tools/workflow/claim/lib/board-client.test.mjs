// FR-DEV-10 (#1412): the board is read with small GraphQL queries, once per run where possible, and a failed read is an error
import test from "node:test";
import assert from "node:assert/strict";
import {
  addBoardItem,
  addProjectItem,
  boardItemOf,
  editBoardField,
  listBoardItems,
  projectMeta,
  setItemOption,
} from "./board-client.mjs";

/** Fake gh for GraphQL: the answer is chosen by the query text (the line holds the whole query). */
function fakeGh(answer) {
  const calls = [];
  return {
    calls,
    async run(cmd, args) {
      const line = `${cmd} ${args.join(" ")}`;
      calls.push(line);
      const value = typeof answer === "function" ? answer(line) : answer;
      if (value instanceof Error) throw value;
      return typeof value === "string" ? value : JSON.stringify(value);
    },
  };
}

const META = {
  data: {
    organization: {
      projectV2: {
        id: "PROJ",
        fields: {
          nodes: [{ id: "F1", name: "Status", options: [{ id: "O1", name: "Todo" }] }, {}],
        },
      },
    },
  },
};

test("FR-DEV-10 (#1412): the project metadata is read once per run, not once per call", async () => {
  const client = fakeGh(META);
  const first = await projectMeta(client, "PflanzenDex");
  const second = await projectMeta(client, "PflanzenDex");
  assert.equal(first, second);
  assert.equal(client.calls.length, 1);
  assert.equal(first.id, "PROJ");
  assert.deepEqual(
    first.fields.map((f) => f.name),
    ["Status"],
    "fields without a name are dropped",
  );
});

test("FR-DEV-10 (#1412): a project that cannot be found is an error, not an empty metadata", async () => {
  const client = fakeGh({ data: { organization: null } });
  await assert.rejects(projectMeta(client, "Nobody"), /project 2 of Nobody not found/);
});

test("FR-DEV-10 (#1412): a rate-limited board read throws with the GraphQL message (P-10), it never returns an empty board", async () => {
  const client = fakeGh({
    errors: [{ message: "API rate limit already exceeded for user ID 1." }],
  });
  await assert.rejects(listBoardItems(client, "PflanzenDex"), /API rate limit already exceeded/);
});

test("FR-DEV-10 (#1412): the whole board is read in pages of 100, issues only, with the plain field values", async () => {
  const item = (number, extra = {}) => ({
    id: `I${number}`,
    content: { __typename: "Issue", number },
    status: null,
    typ: null,
    epic: null,
    priority: null,
    release: null,
    ...extra,
  });
  const page1 = {
    data: {
      organization: {
        projectV2: {
          items: {
            pageInfo: { hasNextPage: true, endCursor: "C1" },
            nodes: [
              item(7, {
                status: { name: "Todo" },
                typ: { name: "Story" },
                priority: { name: "P1 high" },
              }),
              { id: "D", content: { __typename: "DraftIssue" }, status: null },
            ],
          },
        },
      },
    },
  };
  const page2 = {
    data: {
      organization: {
        projectV2: {
          items: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [item(8, { typ: { name: "Epic" }, release: { name: "R1" } })],
          },
        },
      },
    },
  };
  const client = fakeGh((line) => (line.includes("-F after=C1") ? page2 : page1));
  const items = await listBoardItems(client, "PflanzenDex");
  assert.equal(client.calls.length, 2);
  assert.deepEqual(
    items.map((i) => i.issue),
    [7, 8],
  );
  assert.equal(items[0].priority, "P1 high");
  assert.equal(items[0].epic, false);
  assert.equal(items[1].epic, true, "Typ Epic marks an epic");
  assert.equal(items[1].release, "R1");
});

test("FR-DEV-10 (#1412): the status of one issue is read from its own project items (project 2 of the owner only)", async () => {
  const issueWith = (nodes) => ({ data: { repository: { issue: { projectItems: { nodes } } } } });
  const other = {
    id: "X",
    project: { number: 9, owner: { login: "PflanzenDex" } },
    status: { name: "Done" },
  };
  const ours = {
    id: "Y",
    project: { number: 2, owner: { login: "PflanzenDex" } },
    status: { name: "In Progress" },
    typ: { name: "Bug" },
    priority: null,
  };
  const client = fakeGh(issueWith([other, ours]));
  const item = await boardItemOf(client, { repo: "PflanzenDex/PflanzenDex", number: 12 });
  assert.equal(item.id, "Y");
  assert.equal(item.status, "In Progress");
  assert.equal(item.typ, "Bug");
  assert.match(client.calls[0], /-F number=12/);
  assert.equal(client.calls.length, 1, "one query for one issue");
});

test("FR-DEV-10 (#1412): an issue that is not on the board gives null, an unknown issue an error", async () => {
  assert.equal(
    await boardItemOf(
      fakeGh({ data: { repository: { issue: { projectItems: { nodes: [] } } } } }),
      {
        repo: "PflanzenDex/PflanzenDex",
        number: 12,
      },
    ),
    null,
  );
  await assert.rejects(
    boardItemOf(fakeGh({ data: { repository: { issue: null } } }), {
      repo: "PflanzenDex/PflanzenDex",
      number: 999,
    }),
    /issue #999 not found/,
  );
});

test("FR-DEV-10 (#1412): adding an item returns its id, and an option is written with the project id and field id", async () => {
  const client = fakeGh((line) => (line.includes("item-add") ? { id: "ITEM" } : ""));
  const itemId = await addBoardItem(client, "PflanzenDex", "https://github.com/o/r/issues/12");
  assert.equal(itemId, "ITEM");
  await editBoardField(client, {
    meta: { id: "PROJ" },
    itemId,
    field: { id: "F1" },
    option: { id: "O1" },
  });
  assert.ok(
    client.calls.includes(
      "gh project item-edit --id ITEM --project-id PROJ --field-id F1 --single-select-option-id O1",
    ),
  );
});

test("US-DEV-08: the claim adds an issue by its node id with one mutation and returns the item id (#1487)", async () => {
  const client = fakeGh({ data: { addProjectV2ItemById: { item: { id: "PVTI_new" } } } });
  assert.equal(
    await addProjectItem(client, { projectId: "PROJ", contentId: "I_kw62" }),
    "PVTI_new",
  );
  assert.equal(client.calls.length, 1, "one GraphQL request");
  assert.ok(client.calls[0].includes("addProjectV2ItemById"));
  assert.ok(client.calls[0].includes(" -f project=PROJ -f content=I_kw62"));
});

test("US-DEV-08: the claim sets a Status option with one mutation, and a digit-only option id stays a string (#1487)", async () => {
  const client = fakeGh({
    data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "I" } } },
  });
  await setItemOption(client, {
    projectId: "PROJ",
    itemId: "PVTI_1",
    fieldId: "PVTSSF_1",
    optionId: "12345678",
  });
  assert.equal(client.calls.length, 1, "one GraphQL request, no lookup first");
  assert.ok(client.calls[0].includes("updateProjectV2ItemFieldValue"));
  assert.ok(client.calls[0].includes(" -f item=PVTI_1 -f field=PVTSSF_1 -f option=12345678"));
  assert.ok(!client.calls[0].includes(" -F option="));
});

test("US-DEV-08: a rejected mutation throws with the GraphQL message (P-10), it does not pass as done", async () => {
  const client = fakeGh({ errors: [{ message: "Could not resolve to a node" }] });
  await assert.rejects(
    setItemOption(client, { projectId: "P", itemId: "I", fieldId: "F", optionId: "O" }),
    /Could not resolve to a node/,
  );
});
