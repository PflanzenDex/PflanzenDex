// Public interface of the `kernel` module (ADR 0003): mapping errors to HTTP, route helpers, sources, and the sign-in
// service's admin interface (US-ACC-04, US-ACC-01: identity config and the shared admin client).
export { errorBody, runningVersion, statusFor } from "./error-http";
export type { AuthEnv } from "./auth-env";
export { body, imageBody, keyMissing, withoutKey, write } from "./route-helpers";
export type { ResponseShape, Ctx } from "./route-helpers";
export { createMemorySourceCache, createSourceClient } from "./sources";
export { featureAccess, featureGate } from "./feature-gate";
export { readOnly, sharedFindMany, sharedReads } from "./read-scope";
export { accountEtag } from "./account-etag";
export { REDEEM_LIMIT, WRITE_LIMIT, rateLimited, redeemGate, writeLimit } from "./write-limit";
export type { RedeemLimit, WriteLimit } from "./write-limit";
export type { FeatureAccess } from "./feature-gate";
export { adminRequest } from "./identity/admin-client";
export { identityConfigFromEnv, identityRemovalFor } from "./identity/identity-config";
export type { IdentityAdminConfig } from "./identity/identity-config";
