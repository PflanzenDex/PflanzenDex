import {
  appError,
  execute,
  type AppError,
  type Dependencies,
  type Operation,
} from "@pflanzendex/core";
import { isDatabaseUnavailable } from "@pflanzendex/db";
import type { Context } from "hono";
import type { AuthEnv } from "./auth-env";
import { errorBody, statusFor } from "./error-http";

export type Ctx = Context<AuthEnv>;

export interface ResponseShape<A> {
  readonly input: unknown;
  readonly success?: 200 | 201;
  readonly wrapper?: (value: A) => object;
}

/**
 * The only write path of the routes (P-03): the operation checks input, access and repeat guard
 * (`Idempotency-Key`). Errors are answered with a stable code and text, never with the cause.
 */
export async function write<E, A>(
  c: Ctx,
  deps: Dependencies,
  op: Operation<E, A>,
  form: ResponseShape<A>,
) {
  const r = await execute(op, deps, {
    context: { userId: c.get("account").id },
    input: form.input,
    idempotencyKey: c.req.header("idempotency-key") || undefined,
  });
  if (!r.ok) {
    const failure = answeredFailure(r.error);
    if (failure.code === "system.unexpected") console.error("Operation failed", failure.cause);
    return c.json(errorBody(failure), statusFor(failure));
  }
  return c.json(form.wrapper ? form.wrapper(r.value) : (r.value as object), form.success ?? 200);
}

/**
 * The answer of a write route whose request carries no `Idempotency-Key` header (US-QS-03): refused before the body is
 * read or anything else is checked, with the same code the operation gives (`idempotency.key_missing`, 400).
 */
export function keyMissing(c: Context) {
  const failure = appError("idempotency.key_missing");
  return c.json(errorBody(failure), statusFor(failure));
}

/**
 * A database that did not answer inside an operation (statement or lock timeout, no connection) is answered with its own
 * stable code instead of `system.unexpected`, so the client knows that a retry may help (NFR-12, P-10).
 */
function answeredFailure(error: AppError): AppError {
  if (error.code !== "system.unexpected" || !isDatabaseUnavailable(error.cause)) return error;
  console.error("Database unavailable", (error.cause as { message?: unknown }).message);
  return appError("system.database_unavailable");
}

/** The JSON body as an object; anything else counts as empty and fails input validation. */
export async function body(c: Ctx): Promise<Record<string, unknown>> {
  const b: unknown = await c.req.json().catch(() => null);
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

/** An image answer: the bytes with their content type and the given cache rule (the owner's photos are private). */
export function imageBody(
  c: Context,
  file: { readonly bytes: Uint8Array; readonly contentType: string },
  cache: string,
) {
  return c.body(file.bytes as unknown as ArrayBuffer, 200, {
    "content-type": file.contentType,
    "cache-control": cache,
  });
}

/**
 * The value without one key: a response leaves out what the caller must not see (P-05, QG-D2, US-QG-05), e.g. the
 * account id of a friend. The value itself is not changed.
 */
export function withoutKey<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key)) as Omit<T, K>;
}
