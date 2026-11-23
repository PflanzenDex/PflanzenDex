// Public interface of the module `kernel` (ADR 0003): access to the API with sign-in and replay protection, the data layer, shared load error.
export {
  announceWrite,
  call,
  createWrite,
  isKeyConflict,
  newRepeatKey,
  tabAccount,
  tabRefusal,
} from "./api";
export type { Response, ApiError, Write, WriteOptions } from "./api";
export {
  REFERENCE_STALE_TIME,
  SCREEN_STALE_TIME,
  createQueryClient,
} from "@/shared/request/query-client";
export { loadShared } from "@/shared/request/shared-load";
export { useQueryClient, type QueryClient } from "@tanstack/react-query";
export { useClearOnSignOut } from "./client/clear-on-sign-out";
export {
  useInvalidate,
  useReload,
  requestQueryFn,
  useRequest,
  useRequestPages,
  type Request,
} from "@/shared/request/use-request";
export {
  SIGN_IN,
  WRITE_SUCCEEDED,
  dailyRun,
  entityRun,
  useWriteAction,
} from "./write-action/use-write-action";
export type { WriteSend } from "./write-action/use-write-action";
export {
  accountKey,
  appendKey,
  createKey,
  entityKey,
  forgetRepeatKeys,
  releaseRepeatKey,
  runRepeat,
  useRepeatKey,
  type KeyScope,
} from "./write-action/repeat-key";
export { withConflictDismiss } from "./write-action/conflict/key-conflict-dismiss";
export { FeaturesProvider, useFeature, useFeatures } from "./client/features/features";
export type { FeatureStates } from "./client/features/features";
export { currentTimeZone, deviceTimeZone, setProfileTimeZone, todayLocal } from "./time-zone";
