import { useCallback } from "react";
import { useWriteAction } from "../../shared/data";
import { confirmPhaseSwitch } from "../shared/api/care-phases-api";

/**
 * "Jetzt umgestellt" (US-PHA-03): one request at a time, afterwards the page reloads (`after`) so the rows show the
 * new state, and the message says what changed (P-09).
 */
export function usePhaseSwitch(
  api: string,
  token: () => Promise<string | undefined>,
  after: () => void,
) {
  const { run, ...state } = useWriteAction(token, after);
  const confirm = useCallback(
    (specimenIds: readonly string[], success: string) =>
      run((t, key) => confirmPhaseSwitch(api, t, specimenIds, { key }), success),
    [api, run],
  );
  return { ...state, confirm };
}
