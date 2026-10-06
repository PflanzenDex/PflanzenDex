import type { FriendRequest, FriendStore } from "../types";

export interface RequestsDependencies {
  readonly friends: FriendStore;
}

/** The open requests of an account, split by direction (US-SOZ-01); no collection data, only the display name. */
export interface OpenRequests {
  /** Waiting for my answer (US-SOZ-02). */
  readonly incoming: readonly FriendRequest[];
  /** Waiting for the answer of the other side. */
  readonly outgoing: readonly FriendRequest[];
}

export async function friendRequests(
  deps: RequestsDependencies,
  userId: string,
): Promise<OpenRequests> {
  const all = await deps.friends.openRequests(userId);
  return {
    incoming: all.filter((r) => r.direction === "received"),
    outgoing: all.filter((r) => r.direction === "sent"),
  };
}
