// Public interface of the module `kernel` (ADR 0003): access to the API with sign-in and replay protection, shared load error.
export { call, createWrite } from "./api";
export type { Response, ApiError, Write } from "./api";
export { LoadError } from "./load-error";
