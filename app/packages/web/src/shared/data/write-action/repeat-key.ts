import { useMemo, useRef } from "react";
import { isUnanswered, newRepeatKey, type Response } from "../api";

/**
 * The repeat-guard key of one user action (US-QS-03), kept across its repeats. `take` gives the key of the action: the key
 * that a lost answer left, or a new one. `settle` keeps the key after a lost answer, so the next tap repeats the same
 * write, and drops it after a success or a refusal, so the next action is a new write. `drop` ends the action without an
 * answer (a queued write is answered on delivery). `run` takes the key, sends, and settles in one step. Every write a page
 * sends from a user action takes its key here; no other code decides whether two writes are the same.
 */
export function useRepeatKey() {
  const held = useRef<string | null>(null);
  return useMemo(() => {
    const take = (): string => held.current ?? newRepeatKey();
    const settle = (key: string, r: Response<unknown, unknown>): void => {
      held.current = !r.ok && isUnanswered(r.error) ? key : null;
    };
    return {
      take,
      settle,
      drop: (): void => {
        held.current = null;
      },
      run: async <T, D = unknown>(
        send: (key: string) => Promise<Response<T, D>>,
      ): Promise<Response<T, D>> => {
        const key = take();
        const r = await send(key);
        settle(key, r);
        return r;
      },
    };
  }, []);
}
