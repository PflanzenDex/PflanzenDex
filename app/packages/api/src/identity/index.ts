// Public interface of the module `identity` (US-ACC-04, US-ACC-01): the sign-in service's admin interface, configured by
// four environment variables, all or none. The values never leave the process (no log line, no answer, no database row).
export { adminRequest } from "./admin-client";
export { identityAdminConfigFromEnv, identityRemovalFromEnv } from "./identity-config";
export type { IdentityAdminConfig } from "./identity-config";
