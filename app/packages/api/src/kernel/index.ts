// Public interface of the `kernel` module (ADR 0003): mapping errors to HTTP.
export { errorBody, statusFor } from "./error-http";
export type { AuthEnv } from "./auth-env";
export { body, imageBody, write } from "./route-helpers";
export type { ResponseShape, Ctx } from "./route-helpers";
export { createMemorySourceCache, createSourceClient } from "./sources";
export { featureAccess, featureGate } from "./feature-gate";
export { WRITE_LIMIT, writeLimit } from "./write-limit";
export type { WriteLimit } from "./write-limit";
export type { FeatureAccess } from "./feature-gate";
