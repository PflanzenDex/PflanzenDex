import { appError, defineOperation, failed, ok, shape, textField } from "../../../kernel";
import { normalizeInvitationCode } from "../../../account";
import type { FriendRequest, FriendStore } from "../types";

export interface RequestDependencies {
  readonly friends: FriendStore;
}

/**
 * Redeems a friend code and sends the request (US-SOZ-01, FR-SOZ-08, P-03): the inviter sees a request with the
 * display name, not yet a friendship. A code is single-use and expires; unknown, used and expired codes are rejected
 * with their own error. No self-invitation; a request or friendship between the two exists already: no second request,
 * and the code stays unused. Redeeming the same code twice as the same account returns the existing request.
 */
export const friendRequest = (deps: RequestDependencies) =>
  defineOperation<{ code: string }, FriendRequest>({
    name: "friend.request",
    schema: shape({ code: textField("code", { min: 1, max: 200 }) }),
    run: async ({ userId }, input) => {
      const code = normalizeInvitationCode(input.code);
      if (code === null) return failed(appError("friend.unknown_code"));
      const r = await deps.friends.requestWithCode(userId, code);
      if (r.outcome === "requested") return ok(r.request);
      return failed(appError(`friend.${r.outcome}`));
    },
  });
