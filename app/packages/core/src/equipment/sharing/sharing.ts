import {
  appError,
  choiceField,
  defineOperation,
  failed,
  idField,
  ok,
  orNull,
  shape,
  textField,
} from "../../kernel";
import {
  EQUIPMENT_SHARE,
  SHARE_NOTE_LIMITS,
  type EquipmentSharingRow,
  type EquipmentSharingStore,
  type EverythingPrivate,
  type SharedDevice,
} from "./types";

export interface SetSharingDependencies {
  readonly sharing: EquipmentSharingStore;
}

const schema = shape({
  id: idField("id"),
  share: choiceField("share", EQUIPMENT_SHARE),
  note: orNull(textField("note", SHARE_NOTE_LIMITS)),
});

/**
 * Decides whether friends see a piece of equipment (US-EQU-12): `private` (the default) or `friends`, with an optional
 * free-text experience note. Withdrawing (`private`) takes effect for the next retrieval and clears the note; a note
 * on `private` is refused. Only the keeper's own equipment can be shared; a foreign or unknown id is
 * `equipment.not_found` (P-04). Sharing triggers no recommendation for others (FR-EQU-07). Idempotent.
 */
export const equipmentSetSharing = (deps: SetSharingDependencies) =>
  defineOperation({
    name: "equipment.set_sharing",
    schema,
    run: async ({ userId }, input) => {
      const shared = input.share === "friends";
      if (!shared && input.note !== null)
        return failed(
          appError("input.invalid", { details: [{ field: "note", code: "input.invalid" }] }),
        );
      const r = await deps.sharing.set(userId, input.id, shared, input.note);
      if (r === "not_found") return failed(appError("equipment.not_found"));
      return ok({ id: input.id, share: input.share, note: input.note });
    },
  });

/** The keeper's own sharing settings: the shared equipment with its note, everything else is private. */
export async function equipmentSharing(
  deps: SetSharingDependencies,
  userId: string,
): Promise<{ readonly shared: readonly EquipmentSharingRow[] }> {
  return { shared: await deps.sharing.list(userId) };
}

export interface FriendEquipmentDependencies {
  readonly sharing: Pick<EquipmentSharingStore, "sharedBy">;
  readonly privacy: EverythingPrivate;
}

/**
 * The devices `ownerId` shares with the caller (US-EQU-12, FR-EQU-02, P-05): the whitelisted facts only, nothing without
 * a confirmed friendship (the database decides) and nothing while the owner has "Everything private" on (suspends,
 * never deletes). A friend who shares nothing and one who is not a friend look the same: an empty list. Shared
 * devices never appear in the feed (US-SOZ-05); this list is their only place.
 */
export async function friendEquipment(
  deps: FriendEquipmentDependencies,
  viewerId: string,
  ownerId: string,
): Promise<{ readonly devices: readonly SharedDevice[] }> {
  const rows = await deps.sharing.sharedBy(viewerId, ownerId);
  if (rows.length === 0 || (await deps.privacy.everythingPrivate(ownerId))) return { devices: [] };
  return {
    devices: rows.map((d) => ({
      id: d.id,
      type: d.type,
      name: d.name,
      model: d.model,
      luxCeiling: d.luxCeiling,
      note: d.note,
    })),
  };
}
