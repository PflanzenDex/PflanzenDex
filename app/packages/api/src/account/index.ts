// Public interface of the `account` module (ADR 0003): sign-in and account route.
export { authentication, onlyWithConfirmedEmail } from "./auth/middleware";
export { createTokenVerifier } from "./auth/token";
export type { TokenVerifier } from "./auth/token";
export { accountRoutes } from "./account-routes";
export { OPERATOR_PATHS, operatorRoutes } from "./operator-routes";
export { registrationRoutes } from "./registration-routes";
