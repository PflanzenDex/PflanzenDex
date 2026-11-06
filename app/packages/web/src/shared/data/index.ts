// Public interface of the module `kernel` (ADR 0003): access to the API with sign-in and replay protection, the data layer, shared load error.
export { announceWrite, call, createWrite, withRepeatKey } from "./api";
export type { Response, ApiError, Write } from "./api";
export { LoadFrame } from "./client/load-frame/load-frame";
export {
  REFERENCE_STALE_TIME,
  SCREEN_STALE_TIME,
  createQueryClient,
} from "./client/request/query-client";
export { loadShared } from "./client/request/shared-load";
export { useQueryClient, type QueryClient } from "@tanstack/react-query";
export {
  useClearOnSignOut,
  useInvalidate,
  useReload,
  useRequest,
  useRequestPages,
  type Request,
} from "./client/request/use-request";
export { SIGN_IN, WRITE_SUCCEEDED, useWriteAction } from "./use-write-action";
export { FeaturesProvider, useFeature } from "./client/features/features";
export { currentTimeZone, deviceTimeZone, setProfileTimeZone } from "./time-zone";
