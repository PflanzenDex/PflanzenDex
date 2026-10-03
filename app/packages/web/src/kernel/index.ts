// Public interface of the `kernel` module (ADR 0003): access to the API with sign-in and repeat guard.
export { call, createWrite } from "./api";
export type { Response, ApiError, Write } from "./api";
