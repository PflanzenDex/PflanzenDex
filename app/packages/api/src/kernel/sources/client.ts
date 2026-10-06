// HTTP adapter of the SourceClient port (TE-09, NFR-17): throttled, cached, retried with backoff, and every failure
// comes back as an AppError with a stable code (P-10). Tests inject `fetch`, clock and sleep; no real network.
import {
  SOURCE_POLICY,
  backoffDelayMs,
  canonical,
  classifyStatus,
  exhaustedCode,
  ok,
  parseRetryAfter,
} from "@pflanzendex/core";
import type { SourceClient } from "@pflanzendex/core";
import { sourceUrl } from "./endpoints";
import { createThrottle, fail, finish, send } from "./exchange";
import type { Call, Failure, SourceClientDeps } from "./exchange";

export type { SourceClientDeps } from "./exchange";

export function createSourceClient(deps: SourceClientDeps): SourceClient {
  const throttle = createThrottle(deps);

  return {
    async get(request) {
      const url = sourceUrl(request);
      const call: Call = { request, url, key: canonical({ url, body: request.body }) };
      const hit = await deps.cache.get(call.key);
      if (hit) return ok({ ...hit, cached: true });
      let last: Failure = "network";
      for (let n = 1; n <= SOURCE_POLICY.maxAttempts; n++) {
        await throttle(request.source);
        const result = await send(deps, call);
        let retryAfter: number | undefined;
        if ("failure" in result) last = result.failure;
        else if (classifyStatus(result.response.status) !== "retry")
          return finish(deps, call, result.response, n);
        else {
          last = result.response.status;
          retryAfter = parseRetryAfter(result.response.headers.get("retry-after"), deps.now());
        }
        if (n < SOURCE_POLICY.maxAttempts) await deps.sleep(backoffDelayMs(n, retryAfter));
      }
      return fail(exhaustedCode(last), call, SOURCE_POLICY.maxAttempts, last);
    },
  };
}
