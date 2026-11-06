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

/** A board write that failed part way: `written` names the fields set before the failure (P-10, nothing misreported). */
class BoardWriteError extends Error {
  constructor(cause, written) {
    super(cause?.message ?? String(cause));
    this.name = "BoardWriteError";
    this.written = written;
  }
}

/**
 * Sets the fields of the issue at `url` on the project. `fields` maps a field name to the key of its option (see
 * findOption): { Typ: "Story", Epic: "ACC", Priority: "P1", Release: "R2" }. Every option is resolved before the issue is
 * added, so a wrong key writes nothing; a failing edit throws a BoardWriteError that names the fields already set.
 */
export async function setBoardFields(client, { url, owner, fields }) {
  const meta = await projectMeta(client, owner);
  const edits = Object.entries(fields).map(([name, key]) => {
    const field = meta.fields.find((f) => f.name === name);
    if (!field) throw new Error(`project field "${name}" does not exist`);
    const option = findOption(field.options, key);
    if (!option) throw new Error(`project field "${name}" has no option for "${key}"`);
    return { name, field, option };
  });
  const itemId = await addBoardItem(client, owner, url);
  const written = [];
  for (const { name, field, option } of edits) {
    try {
      await editBoardField(client, { meta, itemId, field, option });
    } catch (e) {
      throw new BoardWriteError(e, written);
    }
    written.push(name);
  }
  return itemId;
}
