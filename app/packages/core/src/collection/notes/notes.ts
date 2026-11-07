import {
  appError,
  defineOperation,
  described,
  failed,
  idField,
  isId,
  ok,
  shape,
  type ErrorDetail,
} from "../../kernel";
import { SPECIMEN_LIMITS } from "../shared/types";
import type { NotesStore, SpecimenNotes } from "./types";

/**
 * The text of a note (US-BES-18): trimmed; an empty text, or `null`, is no note and becomes `null`. The limit counts
 * characters as the database does (`char_length`: code points), not UTF-16 units, so the core and the check of the
 * table accept the same texts. Anything that is not text is `input.invalid` on the field.
 */
export const notesField = (field: string) => {
  const check = (value: unknown): string | null | ErrorDetail => {
    if (value === null) return null;
    if (typeof value !== "string") return { field, code: "input.invalid" };
    const text = value.trim();
    if (text === "") return null;
    return [...text].length <= SPECIMEN_LIMITS.notes.max ? text : { field, code: "input.invalid" };
  };
  return described(check, { type: "string", maxLength: SPECIMEN_LIMITS.notes.max });
};

export interface NotesDependencies {
  readonly specimens: NotesStore;
}

const schema = shape({
  specimenId: idField("specimenId"),
  // Required: a missing field is refused, so that a request that forgot the text clears nothing; `""` clears.
  notes: notesField("notes"),
});

const REFUSED = {
  not_found: "specimen.not_found",
  archived: "specimen.archived",
} as const;

/**
 * Sets or clears the private notes of one specimen (US-BES-18, P-05): trimmed, an empty text clears them, more than
 * `SPECIMEN_LIMITS.notes.max` characters are refused (`input.invalid` on `notes`, nothing written). An archived specimen
 * stays unchanged (`specimen.archived`), as its marker, location and light zone do (US-BES-07); a foreign or unknown
 * one looks the same: `specimen.not_found` (P-04). The answer carries the notes only to the keeper.
 */
export const specimenSetNotes = (deps: NotesDependencies) =>
  defineOperation({
    name: "specimen.set_notes",
    schema,
    run: async ({ userId }, input) => {
      const r = await deps.specimens.setNotes(userId, input.specimenId, input.notes);
      return typeof r === "string" ? failed(appError(REFUSED[r])) : ok(r);
    },
  });

/**
 * The keeper's own notes of one specimen (the detail read, `GET /specimens/:id`). `null` for a foreign, unknown or
 * malformed ID, which looks the same (P-04). Nothing else reads the notes: the other reads of a specimen do not select them.
 */
export async function specimenNotes(
  store: NotesStore,
  userId: string,
  id: string,
): Promise<SpecimenNotes | null> {
  if (!isId(id)) return null;
  return store.findNotes(userId, id.toLowerCase());
}
