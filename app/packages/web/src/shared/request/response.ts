/** API error with a stable code (FR-QG-11); `D` is the shape of optional extra data of the error. */
export interface ApiError<D = unknown> {
  code: string;
  text: string;
  details?: { field: string; code: string }[];
  data?: D[];
  /**
   * The German text of a key conflict that names what is saved (US-QS-03), e.g. "Gesichert ist: 12 cm am 22.11.2026. …".
   * Set by the repeat guard when the write describes its saved result; the server never sends it.
   */
  conflictText?: string;
  /**
   * The one control of a key conflict (US-QS-03, P-10): frees the key the write holds and clears the refusal, so the keeper
   * can go on. Set by `useWriteAction` on the error it hands out, for `idempotency.key_conflict` only; the notice that shows
   * the refusal shows "Hinweis schließen" when it is there (`RefusalClose`, `RefusalAlert`, `ErrorNotice`).
   */
  dismiss?: () => void;
}

export type Response<T, D = unknown> = { ok: true; value: T } | { ok: false; error: ApiError<D> };

/** The answer of a request that has no token: nothing is sent, the keeper signs in again (P-04). */
export const SIGN_IN: ApiError = { code: "access.not_signed_in", text: "Bitte melde dich neu an." };
