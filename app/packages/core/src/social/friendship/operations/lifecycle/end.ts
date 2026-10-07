import { appError, defineOperation, failed, idField, ok, shape } from "../../../../kernel";
import type { FriendStore } from "../../types";

export interface EndDependencies {
  readonly friends: FriendStore;
}

/**
 * Ends a friendship (US-SOZ-03, P-03): both sides at once, in one transaction. Everything that is visible only between
 * friends (collection, feed, offers) is withdrawn from both sides immediately, because it is read only through a
 * confirmed friendship (P-05). Own data and completed swaps with their provenance stay. The other side is not notified
 * actively and simply no longer finds the person in its list. Open swap requests with the person are canceled by the
 * swap module once it exists (US-SOZ-10). Ending twice writes nothing; a friend that is unknown or foreign is
 * `friend.not_found` (P-04). The friendship can be started again with a new code.
 */
export const friendEnd = (deps: EndDependencies) =>
  defineOperation<{ friendId: string }, { status: "ended" }>({
    name: "friend.end",
    schema: shape({ friendId: idField("friendId") }),
    run: async ({ userId }, input) => {
      const r = await deps.friends.end(userId, input.friendId);
      return r === "ended" ? ok({ status: "ended" }) : failed(appError("friend.not_found"));
    },
  });
