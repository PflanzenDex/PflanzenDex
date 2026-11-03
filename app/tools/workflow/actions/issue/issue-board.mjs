// Board writes for issues (FR-DEV-10): the issue is added to project 2 if needed, then its single-select fields are set.
// Option ids are read at run time, never stored. Same client shape as claim-steps.mjs (injected in tests).
import { json } from "../../claim/lib/claim-client.mjs";
import { PROJECT_NUMBER } from "../../claim/lib/claim-steps.mjs";
import { findOption } from "./issue-lib.mjs";

/**
 * Sets the fields of the issue at `url` on the project. `fields` maps a field name to the key of its option (see
 * findOption): { Typ: "Story", Epic: "ACC", Priority: "P1" }. Every option is resolved before the issue is added, so a
 * wrong key writes nothing.
 */
export async function setBoardFields(client, { url, owner, fields }) {
  const list = await json(client, [
    "project",
    "field-list",
    PROJECT_NUMBER,
    "--owner",
    owner,
    "--format",
    "json",
  ]);
  const edits = Object.entries(fields).map(([name, key]) => {
    const field = list.fields.find((f) => f.name === name);
    if (!field) throw new Error(`project field "${name}" does not exist`);
    const option = findOption(field.options, key);
    if (!option) throw new Error(`project field "${name}" has no option for "${key}"`);
    return { field, option };
  });
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
  const project = await json(client, [
    "project",
    "view",
    PROJECT_NUMBER,
    "--owner",
    owner,
    "--format",
    "json",
  ]);
  for (const { field, option } of edits)
    await client.run("gh", [
      "project",
      "item-edit",
      "--id",
      item.id,
      "--project-id",
      project.id,
      "--field-id",
      field.id,
      "--single-select-option-id",
      option.id,
    ]);
  return item.id;
}
