import { useMemo, useRef } from "react";
import { isUnanswered, newRepeatKey, type Response } from "../api";

/**
 * The repeat-guard keys of user actions (US-QS-03). `take` gives the key of an action: the key that a lost answer left in
 * its scope, or a new one. `settle` keeps the key after a lost answer, so the next tap of the same action repeats the same
 * write, and drops it after a success or a refusal, so the next action is a new write. `run` takes, sends and settles in
 * one step. `drop` ends an action without an answer (a buffered write is answered on delivery, and the buffer holds its key).
 *
 * The key belongs to the action, not to the hook: a hook that serves many rows or items passes the row or item id (and
 * the action, when one row has several) as `scope`, so a lost answer on one row never sends another row's write under
 * its key. The default scope is the whole hook, for a hook that serves one action. No other code decides whether two
 * writes are the same.
 */
export function useRepeatKey() {
  const held = useRef<Map<string, string>>(new Map());
  return useMemo(() => {
    const take = (scope = ""): string => held.current.get(scope) ?? newRepeatKey();
    const settle = (key: string, r: Response<unknown, unknown>, scope = ""): void => {
      if (!r.ok && isUnanswered(r.error)) held.current.set(scope, key);
      else held.current.delete(scope);
    };
    const drop = (scope = ""): void => {
      held.current.delete(scope);
    };
    const run = async <T, D = unknown>(
      send: (key: string) => Promise<Response<T, D>>,
      scope = "",
    ): Promise<Response<T, D>> => {
      const key = take(scope);
      const r = await send(key);
      settle(key, r, scope);
      return r;
    };
    return { take, settle, drop, run };
  }, []);
}
