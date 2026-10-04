import { appError, type AppError } from "./error";
import { failed, ok, type Result } from "./result";
import { canonical } from "./canonical";
import type { SignedInContext, IdempotencyKey, IdempotencyStore, Context } from "./ports";
import type { Schema } from "./validation";

export interface Operation<E, A> {
  /** `<domain>.<verb>`, e.g. `location.create`. */
  readonly name: string;
  readonly schema: Schema<E>;
  /** Additional authorization (e.g. ownership); the layer always checks sign-in. */
  readonly authorized?: (context: SignedInContext, input: E) => Promise<boolean>;
  /**
   * The result carries a secret that is shown once (e.g. an invitation code). It is then never written to the
   * idempotency store (a leaked database or backup must not hold it): the key is released after the run, so a
   * repeated call with the same key runs again and returns a new secret. Calls that are still running stay guarded.
   */
  readonly secret?: boolean;
  /** Writes only here, only with validated input. Return domain errors as `failed(...)`. */
  readonly run: (context: SignedInContext, input: E) => Promise<Result<A>>;
}

export interface Dependencies {
  readonly idempotency: IdempotencyStore;
}

export interface Call {
  readonly context: Context;
  readonly input: unknown;
  readonly idempotencyKey: string | undefined;
}

export const defineOperation = <E, A>(op: Operation<E, A>): Operation<E, A> => op;

async function access<E, A>(
  op: Operation<E, A>,
  context: Context,
  input: E,
): Promise<Result<SignedInContext>> {
  if (context.userId === null) return failed(appError("access.not_signed_in"));
  const signedIn: SignedInContext = { ...context, userId: context.userId };
  if (op.authorized && !(await op.authorized(signedIn, input))) {
    return failed(appError("access.denied"));
  }
  return ok(signedIn);
}

async function runProtected<E, A>(
  op: Operation<E, A>,
  deps: Dependencies,
  key: IdempotencyKey,
  run: { readonly context: SignedInContext; readonly input: E },
): Promise<Result<A>> {
  let result: Result<A>;
  try {
    result = await op.run(run.context, run.input);
  } catch (cause) {
    await deps.idempotency.discard(key);
    return failed(appError("system.unexpected", { cause }));
  }
  if (!result.ok) {
    await deps.idempotency.discard(key);
    return result;
  }
  if (op.secret) await deps.idempotency.discard(key);
  else await deps.idempotency.complete(key, result.value);
  return result;
}

const BEGIN_ERROR: Record<"running" | "conflict", AppError> = {
  running: appError("idempotency.in_progress"),
  conflict: appError("idempotency.key_conflict"),
};

/**
 * The only way for writes (P-03, AB-3). Order: validate input, check access,
 * reserve idempotency key, run. If an earlier step fails, nothing is written.
 */
export async function execute<E, A>(
  op: Operation<E, A>,
  deps: Dependencies,
  call: Call,
): Promise<Result<A>> {
  const input = op.schema(call.input);
  if (!input.ok) return input;
  const authorized = await access(op, call.context, input.value);
  if (!authorized.ok) return authorized;
  if (!call.idempotencyKey) return failed(appError("idempotency.key_missing"));
  const key: IdempotencyKey = {
    userId: authorized.value.userId,
    operation: op.name,
    key: call.idempotencyKey,
  };
  const begin = await deps.idempotency.begin(key, canonical(input.value));
  if (begin.kind === "repeat") return ok(begin.result as A);
  if (begin.kind !== "fresh") return failed(BEGIN_ERROR[begin.kind]);
  return runProtected(op, deps, key, {
    context: authorized.value,
    input: input.value,
  });
}
