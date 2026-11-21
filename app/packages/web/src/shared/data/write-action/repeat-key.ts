import { useMemo } from "react";
import { isUnanswered, newRepeatKey, type Response } from "../api";

/**
 * The action a repeat-guard key belongs to (US-QS-03). `target` is the row or item the write is about (the account for a
 * single-target form, a constant with a comment there).
 *
 * `action` names the operation, and nothing of the body. The server refuses a key that comes back with another body
 * (`idempotency.key_conflict`), so the key is what stops a second record; the action must not carry the body itself:
 * - A create or an append (it adds a record): the operation only (`create`, `measure`, `request`). A changed form after a
 *   lost answer then gets the conflict, not a second record.
 * - A set-state update (it sets a value on an existing target): the operation, plus a discrete chosen value (`rights:admin`,
 *   `decide:yes`, `answer:accept`, `status:stored`, a zone id). Free text, a whole form or a body of many fields does not
 *   stay in the action: the operation only.
 * - Ids that name the targets of a bulk write (the plants of an undo, the species of a share) are fine: they say what the
 *   write is about, they are not its content.
 *
 * Two hooks with the same target and action share their held key (the registry is module level): each distinct write has
 * a distinct action name.
 */
export type KeyScope = { readonly target: string; readonly action: string };

/**
 * The entities that take repeat-guarded writes. The target of a write about one entity is its prefix and its id
 * (`specimen:<id>`, see `entityKey`), so the ids of two tables never collide. The account has no id (`accountKey`).
 */
export type RepeatEntity =
  | "specimen"
  | "wish"
  | "equipment-wish"
  | "pause"
  | "lamp"
  | "equipment"
  | "sensor"
  | "zone"
  | "location"
  | "species"
  | "offer"
  | "swap"
  | "client"
  | "draft"
  | "task"
  | "treatment"
  | "friend"
  | "case";

/**
 * The repeat-guard key of an action on one entity (US-QS-03): the target is the entity and its id, the action names the
 * operation and the input that decides the body (the rights value, the step, the location).
 */
export const entityKey = (entity: RepeatEntity, id: string, action: string): KeyScope => ({
  target: `${entity}:${id}`,
  action,
});

/**
 * The repeat-guard key of an action on the whole account (its profile, its settings, its deletion). Its target is
 * `account`: a success on any account write frees the keys of the other account writes that are still held (`settle`).
 */
export const accountKey = (action: string): KeyScope => ({ target: "account", action });

/**
 * The keys held after a lost answer, per target and per action. Module level: every hook that writes a target shares
 * them, so a success on that target frees them all (see `settle`). Cleared on sign-out (`forgetRepeatKeys`).
 */
const held = new Map<string, Map<string, string>>();

/** The key of an action: the one a lost answer left, or a new one. */
const take = (scope: KeyScope): string =>
  held.get(scope.target)?.get(scope.action) ?? newRepeatKey();

const KEY_CONFLICT = "idempotency.key_conflict";

const hold = (key: string, scope: KeyScope): void => {
  let actions = held.get(scope.target);
  if (!actions) held.set(scope.target, (actions = new Map()));
  actions.set(scope.action, key);
};

/**
 * Settles the answer of an action (US-QS-03).
 * - A lost answer and `idempotency.in_progress` keep the key: the next tap of the same action repeats it, and the server
 *   answers with the stored answer.
 * - `idempotency.key_conflict` keeps the key too. The server refuses that key with another body because an earlier write
 *   under it has landed or still runs: a tap with another body must not go out under a new key and write a second
 *   record. The key stays until a success on the target, another refusal of the same action, `forgetRepeatKeys` or a
 *   reload (the registry is module state, a reload empties it).
 * - A success frees every held key of its target: the keeper moved on, and replaying an older write would swallow the
 *   newer one (archive, restore, archive).
 * - Any other refusal frees the key of its own action only.
 */
const settle = (key: string, r: Response<unknown, unknown>, scope: KeyScope): void => {
  if (r.ok) {
    held.delete(scope.target);
    return;
  }
  if (isUnanswered(r.error) || r.error.code === KEY_CONFLICT) {
    hold(key, scope);
    return;
  }
  held.get(scope.target)?.delete(scope.action);
};

/** Frees every held key, on sign-out or an account change: a key of another account must never be repeated. */
export const forgetRepeatKeys = (): void => held.clear();

/**
 * The repeat-guard keys of user actions (US-QS-03). `run` takes the key of the action, sends with it and settles the answer
 * in one step. `take` and `settle` are for the cases where the send happens in between (a buffered write, a multi-step
 * action). The scope is required: a call site names its target and the input that decides its body.
 */
export function useRepeatKey() {
  return useMemo(
    () => ({
      take,
      settle,
      run: async <T, D = unknown>(
        send: (key: string) => Promise<Response<T, D>>,
        scope: KeyScope,
      ): Promise<Response<T, D>> => {
        const key = take(scope);
        const r = await send(key);
        settle(key, r, scope);
        return r;
      },
    }),
    [],
  );
}
