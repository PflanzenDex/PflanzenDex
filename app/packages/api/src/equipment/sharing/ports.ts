import { FriendsPostgres, ProfilePostgres } from "@pflanzendex/db";
import type { Pool } from "pg";
import type { FriendEquipmentPorts } from "./sharing-routes";

/**
 * What the view of a friend's devices needs from other modules (ADR 0003): the friend of a friendship id (`social`) and
 * the switch "Everything private" (`account`). The module `equipment` itself reads neither table.
 */
export function friendEquipmentPorts(pool: Pool): FriendEquipmentPorts {
  const friends = new FriendsPostgres(pool);
  const profiles = new ProfilePostgres(pool);
  return {
    friend: async (userId, friendshipId) => {
      const f = (await friends.friends(userId)).find((x) => x.id === friendshipId);
      return f ? { accountId: f.accountId, name: f.name } : null;
    },
    privacy: {
      everythingPrivate: async (userId) =>
        (await profiles.find(userId))?.everythingPrivate ?? false,
    },
  };
}
