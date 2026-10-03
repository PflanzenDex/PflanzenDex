import { execute, type Dependencies, type Operation } from "@pflanzendex/core";
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
    if (r.error.code === "system.unexpected") console.error("Operation failed", r.error.cause);
    return c.json(errorBody(r.error), statusFor(r.error));
  }
  return c.json(form.wrapper ? form.wrapper(r.value) : (r.value as object), form.success ?? 200);
}

/** The JSON body as an object; anything else counts as empty and fails input validation. */
export async function body(c: Ctx): Promise<Record<string, unknown>> {
  const b: unknown = await c.req.json().catch(() => null);
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}
