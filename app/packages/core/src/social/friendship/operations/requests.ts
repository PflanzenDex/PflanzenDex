import type { Friend, FriendRequest, FriendStore } from "../types";

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

/**
 * The confirmed friends of an account (US-SOZ-02): display name, start and the number of shared caught species. Nothing
 * from their collections beyond that (P-05). `sharedSpecies` answers the number for one friend (US-SOZ-04); without
 * it, or when the friend shares nothing, it is `null` = unknown (P-08). The account id never leaves this function.
 */
export async function friendList(
  deps: RequestsDependencies & {
    readonly sharedSpecies?: (viewerId: string, ownerId: string) => Promise<number | null>;
  },
  userId: string,
): Promise<{ readonly friends: readonly Friend[] }> {
  const records = await deps.friends.friends(userId);
  const friends = await Promise.all(
    records.map(async ({ accountId, ...rest }) => ({
      ...rest,
      sharedSpecies: (await deps.sharedSpecies?.(userId, accountId)) ?? null,
    })),
  );
  return { friends };
}

/** The account id of one of my confirmed friends, for the app root to read what the friend shares (US-SOZ-04); `null` if it is none. */
export async function friendAccount(
  deps: RequestsDependencies,
  userId: string,
  friendId: string,
): Promise<string | null> {
  return (await deps.friends.friends(userId)).find((f) => f.id === friendId)?.accountId ?? null;
}
