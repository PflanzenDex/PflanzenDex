// Public interface of the external sources part of `kernel` (TE-09).
export { SOURCE_NAMES } from "./types";
export type {
  SourceName,
  SourceRequest,
  Provenance,
  SourceOutcome,
  SourceClient,
  SourceCache,
} from "./types";
export {
  SOURCE_POLICY,
  classifyStatus,
  backoffDelayMs,
  parseRetryAfter,
  exhaustedCode,
} from "./policy";
export type { StatusClass } from "./policy";
