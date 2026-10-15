import {
  appError,
  equipmentSetSharing,
  equipmentSharing,
  friendEquipment,
} from "@pflanzendex/core";
import type { EverythingPrivate } from "@pflanzendex/core";
import { EquipmentSharingPostgres, type IdempotencyPostgres } from "@pflanzendex/db";
import type { Hono } from "hono";
import type { Pool } from "pg";
import { body, errorBody, statusFor, write, type AuthEnv } from "../../kernel";

/** What the app root supplies for the view of a friend's devices: the friend of a friendship id, and the privacy switch. */
export interface FriendEquipmentPorts {
  /** One of my confirmed friends by friendship id; `null` if it is none. */
  friend(
    userId: string,
    friendshipId: string,
  ): Promise<{ accountId: string; name: string | null } | null>;
  privacy: EverythingPrivate;
}

/**
 * Sharing equipment with friends (US-EQU-12): private by default (P-05).
 * - GET /equipment/sharing: `{ shared: [{ equipmentId, note }] }`, the keeper's own settings; all other equipment is private
 * - PUT /equipment/:id/sharing `{ share: "private" | "friends", note? }` (with `Idempotency-Key`)
 * - GET /equipment/friends/:id: `{ friend: { name }, devices }`, what the friend shares with the caller: the whitelist
 *   only, only through a confirmed friendship, nothing while the friend has "Everything private" on; an id that is not
 *   one of my friends is 404 `friend.not_found`.
 */
export function addSharingRoutes(
  routes: Hono<AuthEnv>,
  pool: Pool,
  deps: { idempotency: IdempotencyPostgres },
  friends: FriendEquipmentPorts,
): void {
  const sharing = new EquipmentSharingPostgres(pool);
  const set = equipmentSetSharing({ sharing });
  routes.get("/equipment/sharing", async (c) =>
    c.json(await equipmentSharing({ sharing }, c.get("account").id)),
  );
  routes.put("/equipment/:id/sharing", async (c) =>
    write(c, deps, set, { input: { note: null, ...(await body(c)), id: c.req.param("id") } }),
  );
  routes.get("/equipment/friends/:id", async (c) => {
    const me = c.get("account").id;
    const friend = await friends.friend(me, c.req.param("id") ?? "");
    if (!friend) {
      const error = appError("friend.not_found");
      return c.json(errorBody(error), statusFor(error));
    }
    const { devices } = await friendEquipment(
      { sharing, privacy: friends.privacy },
      me,
      friend.accountId,
    );
    return c.json({ friend: { name: friend.name }, devices });
  });
}
