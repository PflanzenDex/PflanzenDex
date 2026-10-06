// One HTTP exchange with a source and the turning of its answer into a SourceOutcome (TE-09).
import { SOURCE_POLICY, appError, classifyStatus, failed, ok } from "@pflanzendex/core";
import type {
  ErrorCode,
  Result,
  SourceCache,
  SourceName,
  SourceOutcome,
  SourceRequest,
} from "@pflanzendex/core";

export interface SourceClientDeps {
  readonly fetch: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly cache: SourceCache;
  /** Identifies the app to the source operators (Wikimedia and GBIF ask for it). */
  readonly userAgent: string;
}

export type Failure = number | "timeout" | "network";

/** The request being served: its URL and cache key are worked out once. */
export interface Call {
  readonly request: SourceRequest;
  readonly url: string;
  readonly key: string;
}

const isTimeout = (e: unknown) =>
  e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

/** Throttle: reserve the next free slot synchronously, so concurrent callers queue up instead of bursting. */
export function createThrottle(deps: Pick<SourceClientDeps, "now" | "sleep">) {
  const nextSlot = new Map<SourceName, number>();
  return async (source: SourceName): Promise<void> => {
    const start = Math.max(deps.now(), nextSlot.get(source) ?? 0);
    nextSlot.set(source, start + SOURCE_POLICY.minIntervalMs[source]);
    if (start > deps.now()) await deps.sleep(start - deps.now());
  };
}

export async function send(
  deps: SourceClientDeps,
  { request, url }: Call,
): Promise<{ response: Response } | { failure: Failure }> {
  const hasBody = request.body !== undefined;
  try {
    const response = await deps.fetch(url, {
      method: hasBody ? "POST" : "GET",
      headers: {
        "user-agent": deps.userAgent,
        accept: "application/json",
        ...(hasBody ? { "content-type": "application/json" } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
      signal: AbortSignal.timeout(SOURCE_POLICY.timeoutMs),
    });
    return { response };
  } catch (e) {
    return { failure: isTimeout(e) ? "timeout" : "network" };
  }
}

export const fail = (code: ErrorCode, call: Call, attempts: number, status?: Failure) =>
  failed(appError(code, { data: { source: call.request.source, attempts, status } }));

/** Final answer (anything but 429/5xx): hit and "no hit" are cached, rejections and unreadable bodies are not. */
export async function finish(
  deps: SourceClientDeps,
  call: Call,
  response: Response,
  attempts: number,
): Promise<Result<SourceOutcome>> {
  const kind = classifyStatus(response.status);
  if (kind === "rejected") return fail("source.request_rejected", call, attempts, response.status);
  const provenance = {
    source: call.request.source,
    url: call.url,
    retrievedAt: new Date(deps.now()).toISOString(),
  };
  if (kind === "not_found") {
    const outcome: SourceOutcome = { kind: "not_found", provenance, cached: false };
    await deps.cache.set(call.key, outcome, SOURCE_POLICY.notFoundTtlMs);
    return ok(outcome);
  }
  let data: unknown;
  try {
    data = JSON.parse(await response.text());
  } catch {
    return fail("source.response_invalid", call, attempts, response.status);
  }
  const outcome: SourceOutcome = { kind: "found", data, provenance, cached: false };
  await deps.cache.set(call.key, outcome, SOURCE_POLICY.foundTtlMs);
  return ok(outcome);
}
