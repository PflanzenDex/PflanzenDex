import { defineOperation, ok, shape } from "../../../kernel";
import { newInvitationCode } from "../../../account";
import { FRIEND_CODE_VALIDITY_DAYS, type FriendStore } from "../types";

const DAY_MS = 86_400_000;

export interface InviteDependencies {
  readonly friends: FriendStore;
  /** n bytes from a cryptographically secure source (the API passes `crypto.randomBytes`). */
  readonly random: (bytes: number) => Uint8Array;
  readonly now: () => Date;
}

/** The answer carries the code exactly once: afterwards only its hash exists, nobody can show it again. */
export interface CreatedFriendCode {
  readonly id: string;
  readonly code: string;
  /** UTC instant (ISO 8601). */
  readonly expiresAt: string;
}

/**
 * Creates a friend code (US-SOZ-01, P-03): single-use, valid for 7 days, passed on outside the app. There is no user
 * search: friends find each other only this way (FR-SOZ-08). Only the hash is stored and the answer is not kept for
 * replays (`secret`), so a leaked database holds no codes; a repeat with the same Idempotency-Key creates another code.
 */
export const friendInvite = (deps: InviteDependencies) =>
  defineOperation({
    name: "friend.invite",
    schema: shape({}),
    secret: true,
    run: async ({ userId }) => {
      const code = newInvitationCode(deps.random);
      const expiresAt = new Date(
        deps.now().getTime() + FRIEND_CODE_VALIDITY_DAYS * DAY_MS,
      ).toISOString();
      const saved = await deps.friends.createCode(userId, {
        code: code.replaceAll("-", ""),
        expiresAt,
      });
      return ok<CreatedFriendCode>({ id: saved.id, code, expiresAt: saved.expiresAt });
    },
  });
