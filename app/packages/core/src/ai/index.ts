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
export { DRAFT_EXPIRY_DAYS, aiAdoptDraft, aiDiscardDraft, aiDrafts } from "./drafts";
export { aiProposeDraft } from "./propose";
export type { ProposeCall } from "./propose";
export type {
  AiDraft,
  DraftDependencies,
  DraftStatus,
  DraftStore,
  DraftType,
  DraftTypes,
} from "./drafts";
export { aiMeasurementPhoto } from "./photo";
export type { PhotoCall, PhotoFile, PhotoSource } from "./photo";
// Tasks from the app to the AI client (US-KI-08).
export { aiClaimTask, aiClientTasks, aiDeclineClientTask } from "./tasks/client";
export type { ClientTaskCall } from "./tasks/client";
export {
  aiCancelTask,
  aiCreateTask,
  aiTaskPreview,
  aiTasks,
  clientConnected,
  taskReference,
} from "./tasks/tasks";
export type { TaskDependencies } from "./tasks/tasks";
export { TASK_DRAFT_TYPE, TASK_EXPIRY_DAYS, TASK_TYPES } from "./tasks/model";
export type { AiTask, TaskStatus, TaskStore, TaskTransition, TaskType } from "./tasks/model";
export { taskPrompt } from "./tasks/prompt/prompt";
export type { PromptTask } from "./tasks/prompt/prompt";
export { TASK_INSTRUCTIONS, TASK_TITLES } from "./tasks/prompt/texts";
