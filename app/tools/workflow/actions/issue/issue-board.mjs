// Board writes for issues (FR-DEV-10): the issue is added to project 2 if needed, then its single-select fields are set.
// Option ids are read at run time (once per run, board-client.mjs), never stored. Same client shape as the claim tools (injected in tests).
import {
  addBoardItem,
  boardItemOf,
  editBoardField,
  projectMeta,
} from "../../claim/lib/board-client.mjs";
import { findOption } from "./issue-lib.mjs";

/**
 * The board Status of one issue on project PROJECT_NUMBER of the repository owner, or null when the issue has none or
 * is not on the board yet. One query for this issue; the board is never read as a whole (FR-DEV-10 (e)).
 */
export async function boardStatusOf(client, { repo, number }) {
  const item = await boardItemOf(client, { repo, number });
  return item?.status ?? null;
}

/**
 * Sets the fields of the issue at `url` on the project. `fields` maps a field name to the key of its option (see
 * findOption): { Typ: "Story", Epic: "ACC", Priority: "P1" }. Every option is resolved before the issue is added, so a
 * wrong key writes nothing.
 */
export async function setBoardFields(client, { url, owner, fields }) {
  const meta = await projectMeta(client, owner);
  const edits = Object.entries(fields).map(([name, key]) => {
    const field = meta.fields.find((f) => f.name === name);
    if (!field) throw new Error(`project field "${name}" does not exist`);
    const option = findOption(field.options, key);
    if (!option) throw new Error(`project field "${name}" has no option for "${key}"`);
    return { field, option };
  });
  const itemId = await addBoardItem(client, owner, url);
  for (const { field, option } of edits)
    await editBoardField(client, { meta, itemId, field, option });
  return itemId;
}
