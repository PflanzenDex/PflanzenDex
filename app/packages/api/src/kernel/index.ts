// Public interface of the `kernel` module (ADR 0003): mapping errors to HTTP.
export { errorBody, statusFor } from "./error-http";
export type { AuthEnv } from "./auth-env";
export { body, write } from "./route-helpers";
export type { ResponseShape, Ctx } from "./route-helpers";
