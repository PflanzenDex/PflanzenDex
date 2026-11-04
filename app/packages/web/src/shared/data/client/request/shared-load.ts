import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { ApiError, Response } from "../../api";
import { RequestFailure } from "./query-client";

/**
 * Reads one endpoint through its shared key (issue 1244): a copy that is still fresh (`staleTime`) answers without a
 * request, otherwise the request runs once and its copy is kept under `queryKey`. Every screen that needs the endpoint
 * reads the same key, so the endpoint has one copy; a view that combines it with other data keeps its own key for the
 * combined value. A failure comes back as the same `Response` as the request.
 */
export async function loadShared<T, D = unknown>(
  client: QueryClient,
  queryKey: QueryKey,
  staleTime: number,
  load: () => Promise<Response<T, D>>,
): Promise<Response<T, D>> {
  try {
    const value = await client.fetchQuery({
      queryKey,
      staleTime,
      queryFn: async () => {
        const r = await load();
        if (!r.ok) throw new RequestFailure(r.error);
        return r.value;
      },
    });
    return { ok: true, value };
  } catch (e) {
    if (e instanceof RequestFailure) return { ok: false, error: e.error as ApiError<D> };
    throw e;
  }
}
