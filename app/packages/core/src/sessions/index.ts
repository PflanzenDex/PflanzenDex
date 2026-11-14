// Public interface of the module `sessions` (US-ACC-01, issue 2065): sign out on all devices at the sign-in service.
export { sessionsNotConfigured, signOutEverywhere } from "./sign-out-everywhere";
export type { IdentitySessions, SignOutDependencies } from "./sign-out-everywhere";
