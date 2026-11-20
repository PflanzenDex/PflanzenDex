import { useRef, useState } from "react";
import {
  SIGN_IN,
  useInvalidate,
  useRepeatKey,
  type ApiError,
  type KeyScope,
  type WriteOptions,
} from "../../../shared/data";
import { requestDeletion, type DeletionState } from "../../privacy-api";

type Token = () => Promise<string | undefined>;

/** The query key of the deletion state (US-ACC-04). */
export const DELETION_KEY = ["account", "deletion"] as const;

/**
 * Sends one request at a time (a double tap sends one); a refusal stays visible, nothing is shown as done (P-10). The
 * state is the loaded one until a request answers; then the answer is the state.
 */
export function useDeletionAction(props: {
  api: string;
  token: Token;
  loaded: DeletionState | undefined;
}) {
  const [answered, setAnswered] = useState<DeletionState | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const busy = useRef(false);
  const keys = useRepeatKey();
  const refresh = useInvalidate(DELETION_KEY);
  const send = async (
    action: (
      api: string,
      token: string,
      options: WriteOptions,
    ) => ReturnType<typeof requestDeletion>,
    done: string,
    scope: KeyScope,
  ) => {
    if (busy.current) return false;
    busy.current = true;
    setRunning(true);
    const t = await props.token();
    // The key belongs to the request and its opposite (US-QS-03): a cancel frees the held request key of the account.
    const r = t
      ? await keys.run((key) => action(props.api, t, { key }), scope)
      : { ok: false as const, error: SIGN_IN };
    busy.current = false;
    setRunning(false);
    setError(r.ok ? null : r.error);
    setMessage(r.ok ? done : null);
    if (r.ok) setAnswered(r.value);
    refresh();
    return true;
  };
  return { state: answered ?? props.loaded, running, message, error, send };
}
