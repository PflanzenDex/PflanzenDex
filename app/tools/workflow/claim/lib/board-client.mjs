// Project board reads and writes for the local tools (FR-DEV-10, US-DEV-08). The board has no REST route, so it is GraphQL.
// Costs measured on 2026-11-05 with GitHub's own rateLimit.cost of the queries gh sends:
//   gh project item-list   about 1 point per item (704 items: about 700 points for one full listing, 8 pages),
//   gh project field-list  about 100 points, it loads 100 items with their fields (gh project view costs 1),
//   one issue's projectItems 1 to 2 points.
// So the board is read here with small queries: the field ids and options once per run, one issue's items, and the whole
// board in pages of 100 with plain field values (no nested connection per item). Writes stay with gh project (item-add, item-edit).
import { graphql, json } from "./claim-client.mjs";

export const PROJECT_NUMBER = "2"; // "PflanzenDex Roadmap"
export const STATUS_FIELD = "Status";

const memo = new WeakMap(); // client -> project metadata per owner, read once per run

const META_QUERY = `query($owner: String!, $number: Int!) {
  organization(login: $owner) {
    projectV2(number: $number) {
      id
      fields(first: 100) {
        nodes {
          ... on ProjectV2Field { id name }
          ... on ProjectV2SingleSelectField { id name options { id name } }
        }
      }
    }
  }
}`;

const SINGLE_SELECT = "... on ProjectV2ItemFieldSingleSelectValue { name }";
const FIELD_VALUES = `
  status: fieldValueByName(name: "Status") { ${SINGLE_SELECT} }
  typ: fieldValueByName(name: "Typ") { ${SINGLE_SELECT} }
  epic: fieldValueByName(name: "Epic") { ${SINGLE_SELECT} }
  priority: fieldValueByName(name: "Priority") { ${SINGLE_SELECT} }
  release: fieldValueByName(name: "Release") { ${SINGLE_SELECT} }`;

const ITEMS_QUERY = `query($owner: String!, $number: Int!, $after: String) {
  organization(login: $owner) {
    projectV2(number: $number) {
      items(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          content { __typename ... on Issue { number } }
          ${FIELD_VALUES}
        }
      }
    }
  }
}`;

const ITEM_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      projectItems(first: 10) {
        nodes {
          id
          project { number owner { ... on Organization { login } ... on User { login } } }
          ${FIELD_VALUES}
        }
      }
    }
  }
}`;

/** The board item of one issue in the shape the claim and board rules read (Typ decides the branch type). */
export function itemOf(node, number) {
  const typ = node.typ?.name ?? null;
  return {
    id: node.id,
    issue: number,
    status: node.status?.name ?? null,
    priority: node.priority?.name ?? null,
    epic: typ === "Epic",
    typ,
    release: node.release?.name ?? null,
  };
}

/** Id and fields (with option ids) of the project, read once per run. Ids are read at run time, never stored. */
export function projectMeta(client, owner) {
  if (!memo.has(client)) memo.set(client, new Map());
  const cache = memo.get(client);
  if (!cache.has(owner)) {
    cache.set(
      owner,
      graphql(client, META_QUERY, { owner, number: PROJECT_NUMBER }).then((data) => {
        const project = data.organization?.projectV2;
        if (!project) throw new Error(`project ${PROJECT_NUMBER} of ${owner} not found`);
        return { id: project.id, fields: project.fields.nodes.filter((f) => f.name) };
      }),
    );
  }
  return cache.get(owner);
}

/** Every issue on the board (pull requests and drafts left out), in pages of 100. */
export async function listBoardItems(client, owner) {
  const items = [];
  let after;
  do {
    const data = await graphql(client, ITEMS_QUERY, { owner, number: PROJECT_NUMBER, after });
    const page = data.organization?.projectV2?.items;
    if (!page) throw new Error(`project ${PROJECT_NUMBER} of ${owner} not found`);
    for (const node of page.nodes) {
      if (node.content?.__typename === "Issue") items.push(itemOf(node, node.content.number));
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : undefined;
  } while (after);
  return items;
}

/** The board item of one issue on this project, or null when the issue is not on the board. One query, one issue. */
export async function boardItemOf(client, { repo, number }) {
  const [owner, name] = repo.split("/");
  const data = await graphql(client, ITEM_QUERY, { owner, name, number });
  const issue = data.repository?.issue;
  if (!issue) throw new Error(`issue #${number} not found in ${repo}`);
  const node = issue.projectItems.nodes.find(
    (n) =>
      n.project.number === Number(PROJECT_NUMBER) &&
      n.project.owner.login?.toLowerCase() === owner.toLowerCase(),
  );
  return node ? itemOf(node, number) : null;
}

/** Adds the issue at `url` to the project (a write through gh); returns the item id. */
export async function addBoardItem(client, owner, url) {
  const item = await json(client, [
    "project",
    "item-add",
    PROJECT_NUMBER,
    "--owner",
    owner,
    "--url",
    url,
    "--format",
    "json",
  ]);
  return item.id;
}

/** Sets one single-select field of a board item to one option (a write through gh). */
export async function editBoardField(client, { meta, itemId, field, option }) {
  await client.run("gh", [
    "project",
    "item-edit",
    "--id",
    itemId,
    "--project-id",
    meta.id,
    "--field-id",
    field.id,
    "--single-select-option-id",
    option.id,
  ]);
}
