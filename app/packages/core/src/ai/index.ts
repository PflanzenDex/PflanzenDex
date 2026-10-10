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
