import { useCallback } from "react";
import { useWriteAction } from "../../shared/data";
import { confirmPhaseSwitch } from "../shared/api/care-phases-api";

/**
 * "Umstellen" (US-PHA-03): one request at a time, afterwards the page reloads (`after`) so the rows show the
 * new state, and the message says what changed (P-09). A caller that holds a result in place (US-QS-32) passes `say`,
 * which then receives the result instead of `message`.
 */
export function usePhaseSwitch(
  api: string,
  token: () => Promise<string | undefined>,
  after: () => void,
  say?: (message: string, kind?: "success" | "error") => void,
) {
  const { run, ...state } = useWriteAction(token, after, say);
  const confirm = useCallback(
    (specimenIds: readonly string[], success: string) =>
      run((t, opts) => confirmPhaseSwitch(api, t, specimenIds, opts), success),
    [api, run],
  );
  return { ...state, confirm };
}
