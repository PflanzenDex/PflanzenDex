import { appError, defineOperation, failed, idField, ok, shape } from "../../../../kernel";
import type { FriendStore } from "../../types";

export interface EndDependencies {
  readonly friends: FriendStore;
  /**
   * Runs once for the caller after the friendship ended: the app root fills it with the cancelation of open swaps
   * (ADR 0012: `social` never imports `swap`). A failure is never allowed to undo the ending; the swap module checks
   * the friendship again on every transition, so nothing stays alive behind a dead friendship.
   */
  readonly afterEnd?: (userId: string) => Promise<void>;
}

/**
 * Ends a friendship (US-SOZ-03, P-03): both sides at once, in one transaction. Everything that is visible only between
 * friends (collection, feed, offers) is withdrawn from both sides immediately, because it is read only through a
 * confirmed friendship (P-05). Own data and completed swaps with their provenance stay. The other side is not notified
 * actively and simply no longer finds the person in its list. Open swap requests with the person are canceled by the
 * swap module through `afterEnd` (US-SOZ-10) and, as a second line, by its own check on every transition. Ending twice writes nothing; a friend that is unknown or foreign is
 * `friend.not_found` (P-04). The friendship can be started again with a new code.
 */
export const friendEnd = (deps: EndDependencies) =>
  defineOperation<{ friendId: string }, { status: "ended" }>({
    name: "friend.end",
    schema: shape({ friendId: idField("friendId") }),
    run: async ({ userId }, input) => {
      const r = await deps.friends.end(userId, input.friendId);
      if (r !== "ended") return failed(appError("friend.not_found"));
      await deps.afterEnd?.(userId).catch(() => undefined);
      return ok({ status: "ended" });
    },
  });
