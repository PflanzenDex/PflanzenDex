import type { AppError } from "./error";

export type Result<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AppError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const failed = (f: AppError): Result<never> => ({ ok: false, error: f });
