// Public interface of the deadline view of deletions (US-ACC-04, issue 1673): the legal one-month deadline, the warning
// window, the operator's read of the open deletions and the mark of an identity removal done by hand.
export {
  classifyDeadlines,
  DEADLINE_RULES,
  deadlineHealth,
  deadlineOf,
  deadlineState,
} from "./deletion-deadline";
export type {
  DeadlineEntry,
  DeadlineHealth,
  DeadlineReport,
  DeadlineState,
  DeletionItem,
} from "./deletion-deadline";
export { operatorDeletions, privacyMarkIdentityRemoved } from "./operator-deletions";
export type {
  DeletionQueueItem,
  DeletionQueueRow,
  DeletionQueueStore,
  OperatorDeletions,
} from "./operator-deletions";
