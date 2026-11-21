import { useMemo } from "react";
import { isUnanswered, newRepeatKey, type Response } from "../api";

/**
 * The action a repeat-guard key belongs to (US-QS-03). `target` is the row, the item or the new entity the write is about
 * (`accountKey` for the account, `createKey` for a create). `action` names the operation and, for a set-state write, a
 * discrete chosen value. The server refuses a key that comes back with another body (`idempotency.key_conflict`), so the
 * key is what stops a second record; the action never carries the body itself.
 *
 * `adds` marks a create or an append (it adds a record). The two classes differ in what a conflict and a success mean:
 * - A create or an append (`adds: true`): the action names the operation only, never the body. A conflict keeps the key
 *   (the earlier write under it landed or still runs: no second record). A success of another action on the target does
 *   not free the key, so a silent or unrelated write cannot make a lost create write twice.
 * - A set-state update (no `adds`): the operation, plus a discrete chosen value (`rights:admin`, `decide:yes`,
 *   `answer:accept`, a zone id). A conflict frees the key: it only sets state, so the next tap is a fresh write. Free
 *   text and whole forms stay out of the action.
 * - Ids that name the targets of a bulk write (the plants of an undo, the species of a share) are fine: they say what the
 *   write is about, they are not its content.
 *
 * Two hooks with the same target and action share their held key (the registry is module level): each distinct write has
 * a distinct action name.
 */
export type KeyScope = { readonly target: string; readonly action: string; readonly adds?: true };

/**
 * The entities that take repeat-guarded writes about an existing row. The target of a write about one entity is its prefix
 * and its id (`specimen:<id>`, see `entityKey`), so the ids of two tables never collide. The account has no id (`accountKey`).
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

/** The entities a create adds a row of: each gets its own target `new:<entity>` (US-QS-03). */
export type CreateEntity =
  | "specimen"
  | "wish"
  | "equipment"
  | "equipment-wish"
  | "zone"
  | "location"
  | "species"
  | "treatment"
  | "pause"
  | "task"
  | "offer"
  | "friend"
  | "invite";

/**
 * The repeat-guard key of an action on one entity (US-QS-03): the target is the entity and its id, the action names the
 * operation and the input that decides the body (the rights value, the step, the location).
 */
export const entityKey = (entity: RepeatEntity, id: string, action: string): KeyScope => ({
  target: `${entity}:${id}`,
  action,
});

/**
 * The repeat-guard key of an append to one entity (a measurement, a watering, a request on an offer): the target is the
 * entity and its id, the action names the operation and the occasion (the day), never the body (US-QS-03).
 */
export const appendKey = (entity: RepeatEntity, id: string, action: string): KeyScope => ({
  target: `${entity}:${id}`,
  action,
  adds: true,
});

/**
 * The repeat-guard key of a create of a new row of an entity: the target is `new:<entity>`, its own target, so no other
 * write of the account frees it (US-QS-03). The action names the operation only, the form is the body.
 */
export const createKey = (entity: CreateEntity, action: string): KeyScope => ({
  target: `new:${entity}`,
  action,
  adds: true,
});

/**
 * The repeat-guard key of an action on the whole account, for account-level set-state only (the profile, the style, the
 * reminders, the deletion). Its target is `account`: a success on any of these frees the other held account keys.
 */
export const accountKey = (action: string): KeyScope => ({ target: "account", action });

/**
 * The keys held after a lost answer, per target and per action. Module level: every hook that writes a target shares
 * them (see `settle`). Cleared on sign-out (`forgetRepeatKeys`).
 */
type Held = { readonly key: string; readonly adds: boolean };
const held = new Map<string, Map<string, Held>>();

/** The key of an action: the one a lost answer left, or a new one. */
const take = (scope: KeyScope): string =>
  held.get(scope.target)?.get(scope.action)?.key ?? newRepeatKey();

const KEY_CONFLICT = "idempotency.key_conflict";

const hold = (key: string, scope: KeyScope): void => {
  let actions = held.get(scope.target);
  if (!actions) held.set(scope.target, (actions = new Map()));
  actions.set(scope.action, { key, adds: scope.adds === true });
};

/**
 * Settles the answer of an action (US-QS-03).
 * - A lost answer, `idempotency.in_progress` and an answer that never reached an operation (`access.not_signed_in`, no
 *   token) keep the key: the next tap of the same action repeats it, and the server answers with the stored answer.
 * - `idempotency.key_conflict` of a create or an append keeps the key: the server refused that key with another body
 *   because an earlier write under it has landed or still runs, so a tap with another body must not write a second
 *   record. The key stays until its own action is answered (a success, another refusal), `forgetRepeatKeys` or a reload.
 * - `idempotency.key_conflict` of a set-state frees the key: it only sets state, so the next tap is a fresh write.
 * - A success frees the held keys of its target that are set-state (the keeper moved on: archive, restore, archive), and
 *   its own key. An append or a create held on the target stays held: it is freed by its own answer only.
 * - Any other refusal frees the key of its own action only.
 */
const settle = (key: string, r: Response<unknown, unknown>, scope: KeyScope): void => {
  const actions = held.get(scope.target);
  if (r.ok) {
    actions?.delete(scope.action);
    for (const [action, entry] of actions ?? []) if (!entry.adds) actions?.delete(action);
    if (actions?.size === 0) held.delete(scope.target);
    return;
  }
  if (isUnanswered(r.error) || (r.error.code === KEY_CONFLICT && scope.adds === true)) {
    hold(key, scope);
    return;
  }
  actions?.delete(scope.action);
};

/** Frees every held key, on sign-out or an account change: a key of another account must never be repeated. */
export const forgetRepeatKeys = (): void => held.clear();

/**
 * Sends one write under the held key of its action and settles the answer (US-QS-03). The one place where a user action
 * takes its key and settles it: the hook `useRepeatKey` and the plain callers (the sign-out) use it.
 */
export const runRepeat = async <T, D = unknown>(
  scope: KeyScope,
  send: (key: string) => Promise<Response<T, D>>,
): Promise<Response<T, D>> => {
  const key = take(scope);
  const r = await send(key);
  settle(key, r, scope);
  return r;
};

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
      run: <T, D = unknown>(
        send: (key: string) => Promise<Response<T, D>>,
        scope: KeyScope,
      ): Promise<Response<T, D>> => runRepeat(scope, send),
    }),
    [],
  );
}
