import type { ErrorDetail } from "../../kernel";
import { appError, defineOperation, failed, idField, ok, shape } from "../../kernel";

/** The result of setting the flag: `changed` is false when the wish already had that value, nothing was written. */
export interface WishVisibilityChange {
  readonly wishId: string;
  readonly visible: boolean;
  readonly changed: boolean;
}

/**
 * Port for the wish flag `Visible_To_Friends` (DM-TAU-02). Every call applies to the account `userId` only (P-04); the
 * adapter lives in `db`. `not_found`: no wish of the account (a foreign one looks the same, P-04); `not_open`: the wish
 * is bought or discarded and can no longer be made visible (taking the flag back is always allowed).
 */
export interface WishVisibilityStore {
  set(
    userId: string,
    wishId: string,
    visible: boolean,
  ): Promise<WishVisibilityChange | "not_found" | "not_open">;
  /** The IDs of the account's open plant wishes that carry the flag. */
  flagged(userId: string): Promise<readonly string[]>;
}

export interface WishVisibilityDependencies {
  readonly visibility: Pick<WishVisibilityStore, "set">;
}

export interface WishVisibilityResult extends WishVisibilityChange {
  readonly hint: { readonly text: string; readonly nextAction: string };
}

const ERROR = { not_found: "wish.not_found", not_open: "wish.not_open_for_friends" } as const;

const visibleField = (value: unknown): boolean | ErrorDetail =>
  typeof value === "boolean" ? value : { field: "visible", code: "input.invalid" };

const schema = shape({ wishId: idField("wishId"), visible: visibleField });

/**
 * Marks an open plant wish as "visible to friends as wanted" or takes the mark back (DM-TAU-02, US-TAU-05). Private by
 * default (P-05): only the owner sets the flag, per wish, deliberately; the owner takes it back at any time, also for a
 * wish that is bought or discarded by now (nothing stays shared unnoticed). Only an open wish can be made visible
 * (`wish.not_open_for_friends`); a wish of another account looks unknown (`wish.not_found`, P-04). Idempotent; the same
 * Idempotency-Key replays the first answer (US-QS-03). What it does: confirmed friends can learn that you want this
 * species, only as a yes or no beside their own offer of it, never as a list (FR-WUN-07).
 */
export const wishVisibility = (deps: WishVisibilityDependencies) =>
  defineOperation({
    name: "wish.set_visible_to_friends",
    schema,
    run: async ({ userId }, input) => {
      const r = await deps.visibility.set(userId, input.wishId, input.visible);
      if (typeof r === "string") return failed(appError(ERROR[r]));
      return ok<WishVisibilityResult>({
        ...r,
        hint: input.visible
          ? {
              text: "Bestätigte Freunde sehen jetzt bei ihrem Angebot dieser Art „Passt in beide Richtungen“. Deine Wunschliste bleibt für sie unsichtbar.",
              nextAction: "Du kannst die Freigabe jederzeit wieder zurücknehmen.",
            }
          : {
              text: "Der Wunsch ist wieder privat. Freunde sehen ihn nicht mehr.",
              nextAction: "Du kannst ihn jederzeit wieder für Freunde sichtbar machen.",
            },
      });
    },
  });

/** The open wishes the account marked as visible to friends, so the wishlist can show the switch (P-09). */
export async function wishVisibleList(
  deps: { readonly visibility: Pick<WishVisibilityStore, "flagged"> },
  userId: string,
): Promise<{ readonly wishIds: readonly string[] }> {
  return { wishIds: await deps.visibility.flagged(userId) };
}
