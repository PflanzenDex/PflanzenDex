/** What an item of the today list is about (TE-07). */
export type TodayKind =
  | "treatment_overdue"
  | "treatment_due"
  | "phase_deviation"
  | "measurement_etiolated"
  | "specimen_incomplete"
  | "buffer_low";

/** The place where the next action is done; neutral names, the interface maps them to its views (P-09). */
export type TodayTarget = "treatments" | "care_phases" | "measurements" | "hints" | "wishlist";

/** One entry of the today list: what is the matter, and what to do next (P-09). Derived, never stored (P-01). */
export interface TodayItem {
  /**
   * Stable per cause (`treatment:<id>`, `phase:<specimen>`, `etiolated:<specimen>`, `hint:<specimen>:<kind>`,
   * `buffer:<zone>`), so lists can be compared.
   */
  readonly id: string;
  readonly kind: TodayKind;
  /** `null` for an item about the whole account, such as a zone below the buffer (US-WUN-02). */
  readonly specimenId: string | null;
  readonly specimenName: string | null;
  readonly text: string;
  readonly nextAction: string;
  readonly target: TodayTarget;
}

/** The answer of `todayStatus`. */
export interface TodayList {
  /** The local calendar date `YYYY-MM-DD` the list was derived for (NFR-08). */
  readonly date: string;
  /** Most urgent first. */
  readonly items: readonly TodayItem[];
  /** Open treatments that are not due yet; counted so that nothing disappears silently (P-10). */
  readonly upcoming: number;
}
