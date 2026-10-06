// Public interface of the feature `candidates` (US-WUN-01): the prioritized open wishes and the duplicate-name hint.
export { titleOf, wishCandidates } from "./candidates";
export { REPLENISH_BUFFER } from "./replenishment";
export type {
  Candidate,
  CandidateList,
  CandidatesDependencies,
  DuplicateWish,
  PriorityKind,
  ReplenishZone,
  Replenishment,
} from "./types";
