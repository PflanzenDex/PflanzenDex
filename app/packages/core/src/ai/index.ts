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
export { DEFAULT_DAILY_LIMIT, checkDailyLimit, dayWindow } from "./limit/limit";
export { aiProposeDraft } from "./results/propose";
export type { ProposeCall } from "./results/propose";
export type {
  AiDraft,
  DraftDependencies,
  DraftStatus,
  DraftStore,
  DraftType,
  DraftTypes,
} from "./drafts";
export { aiMeasurementPhoto } from "./results/photo";
export type { PhotoCall, PhotoFile, PhotoSource } from "./results/photo";
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
export { aiDiscoverDecide, aiDiscoverSuggestions } from "./results/discover";
export type { DiscoverCall, DiscoverOutcome, DiscoverSource } from "./results/discover";
export { aiCheckImageSource } from "./results/image-source";
// Rule discovery (US-KI-13, FR-KI-17).
export {
  RULES_VERSION,
  aiCheckSpeciesName,
  aiDescribeRules,
  checkSpeciesNameSchema,
  describeRules,
  describeRulesSchema,
} from "./results/rules";
export type {
  NameVerdict,
  RuleArea,
  RuleOperation,
  RulesDependencies,
  RulesDescription,
  RulesSource,
} from "./results/rules";
export type { ImageSourceCall, ImageSourceChecker } from "./results/image-source";
// The catalog and the collection by name (US-KI-11, FR-KI-15, FR-KI-16).
export {
  aiGetSpecies,
  aiSearchSpecies,
  getSpeciesSchema,
  resolveSpecies,
  searchSpeciesSchema,
} from "./reads/catalog-reads";
export type { ReadDependencies } from "./reads/catalog-reads";
export {
  aiGetSpecimen,
  aiListLightZones,
  aiListLocations,
  aiListMeasurements,
  aiListSpecimens,
  getSpecimenSchema,
  listMeasurementsSchema,
  listPlacesSchema,
  listSpecimensSchema,
} from "./reads/collection-reads";
export { NAMING_LIMITS, normalizeName, resolveName } from "./reads/naming";
export type { Named, Resolution } from "./reads/naming";
export { PAGE_SIZE } from "./reads/types";
export type {
  CollectionReadSource,
  LocationRow,
  MeasurementsRead,
  Page,
  ReadCall,
  SpeciesItem,
  SpecimenItem,
  ZoneRow,
} from "./reads/types";
