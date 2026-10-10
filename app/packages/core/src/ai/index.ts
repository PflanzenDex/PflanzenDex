// Public interface of the module `ai` (ADR 0003, ADR 0013, epic KI): the connection of the keeper's AI client.
export {
  AI_OPERATION_CLASSES,
  AI_RIGHTS,
  AI_SCOPES,
  DEFAULT_AI_RIGHTS,
  isAiRights,
  lowerOf,
  mayCall,
  rankOf,
  rightNeeded,
  rightsOfScope,
} from "./rights";
export type { AiRights, OperationClass } from "./rights";
export { aiAllowAgain, aiConnections, aiRevoke, aiSetRights, authorizeClient } from "./connection";
export type {
  AiConnection,
  Authorized,
  ClientCall,
  ConnectionDependencies,
  ConnectionStore,
} from "./connection";
export { AI_LOG_LIMIT, aiLog, aiStatus } from "./status";
export type { AiLogRow, AiLogStore, StatusCall, StatusDependencies, StatusSource } from "./status";
export {
  DRAFT_EXPIRY_DAYS,
  aiAdoptDraft,
  aiDiscardDraft,
  aiDrafts,
  aiProposeDraft,
} from "./drafts";
export type {
  AiDraft,
  DraftDependencies,
  DraftStatus,
  DraftStore,
  DraftType,
  DraftTypes,
  ProposeCall,
} from "./drafts";
export { aiMeasurementPhoto } from "./photo";
export type { PhotoCall, PhotoFile, PhotoSource } from "./photo";
