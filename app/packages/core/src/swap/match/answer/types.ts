/** A stored answer of the caller to an offer (DM-TAU-01). */
export interface StoredMatchAnswer {
  readonly offerId: string;
  readonly answer: "no" | "later";
  /** Local calendar date `YYYY-MM-DD` of the keeper (NFR-08). */
  readonly answeredOn: string;
}

/** Port for the private answers No and Later; the adapter lives in `db` and runs under the row rule (P-04, P-05). */
export interface MatchAnswers {
  /** The caller's own answers, oldest first. */
  list(userId: string): Promise<readonly StoredMatchAnswer[]>;
  /** Stores or replaces the answer to an offer; one per offer. */
  save(
    userId: string,
    value: {
      readonly offerId: string;
      readonly answer: "no" | "later";
      readonly answeredOn: string;
      readonly speciesLatin: string | null;
      readonly speciesGerman: string | null;
      readonly giverName: string | null;
    },
  ): Promise<void>;
  /** Takes the answer back; true when there was one. */
  remove(userId: string, offerId: string): Promise<boolean>;
}
