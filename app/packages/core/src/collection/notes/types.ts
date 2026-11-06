// The private notes of a specimen (US-BES-18, P-05): the shape and the port; the adapter lives in `db`.

/** The private notes of one specimen, read only by its keeper (US-BES-18, P-05). */
export interface SpecimenNotes {
  readonly id: string;
  /** `null` = no note. */
  readonly notes: string | null;
}

/**
 * Port for the private notes (US-BES-18); its own port, so that the readers of specimens and the other writes do not
 * need it. Both calls work for the account `userId` only (P-04): a foreign or unknown specimen reads `null` and answers
 * `not_found`, an archived one answers `archived` and keeps its notes.
 */
export interface NotesStore {
  findNotes(userId: string, id: string): Promise<SpecimenNotes | null>;
  setNotes(
    userId: string,
    id: string,
    notes: string | null,
  ): Promise<SpecimenNotes | "not_found" | "archived">;
}
