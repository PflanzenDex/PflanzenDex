import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { equipmentSetSharing, equipmentSharing, friendEquipment } from "./index";
import { InMemoryEquipmentSharing } from "./test-helpers";

// US-EQU-12: sharing equipment with friends, private by default, whitelist only, nothing without friendship.
const LAMP = "00000000-0000-4000-8000-0000000000e1";
const TIMER = "00000000-0000-4000-8000-0000000000e2";
let sharing: InMemoryEquipmentSharing;
let idem: InMemoryIdempotencyStore;
let everythingPrivate: Set<string>;
let n = 0;
const privacy = { everythingPrivate: async (u: string) => everythingPrivate.has(u) };

const set = (input: unknown, userId = "anna") =>
  execute(
    equipmentSetSharing({ sharing }),
    { idempotency: idem },
    { context: { userId }, input, idempotencyKey: `k${++n}` },
  );
const view = (viewer: string, owner = "anna") =>
  friendEquipment({ sharing, privacy }, viewer, owner);

beforeEach(() => {
  sharing = new InMemoryEquipmentSharing(new Set(["ben>anna"]));
  idem = new InMemoryIdempotencyStore();
  everythingPrivate = new Set();
  sharing.own("anna", LAMP, {
    type: "Lamp",
    name: "Lampe Alpha",
    model: "GL-9",
    luxCeiling: 15000,
  });
  sharing.own("anna", TIMER, { name: "Zeitschaltuhr" });
});

describe("US-EQU-12 share equipment with friends", () => {
  it("US-EQU-12 equipment is private by default: nothing shared, nothing visible", async () => {
    expect((await equipmentSharing({ sharing }, "anna")).shared).toEqual([]);
    expect((await view("ben")).devices).toEqual([]);
  });

  it("US-EQU-12 sharing a device shows the whitelist and the note to a friend, and withdrawing hides it", async () => {
    expect((await set({ id: LAMP, share: "friends", note: "sehr hell" })).ok).toBe(true);
    expect((await view("ben")).devices).toEqual([
      {
        id: LAMP,
        type: "Lamp",
        name: "Lampe Alpha",
        model: "GL-9",
        luxCeiling: 15000,
        note: "sehr hell",
      },
    ]);
    await set({ id: LAMP, share: "private", note: null });
    expect((await view("ben")).devices).toEqual([]);
    expect((await equipmentSharing({ sharing }, "anna")).shared).toEqual([]);
  });

  it("US-EQU-12 never shares price, place of purchase, serial number, location or purchase date", async () => {
    await set({ id: LAMP, share: "friends", note: null });
    const keys = Object.keys((await view("ben")).devices[0] ?? {}).sort();
    expect(keys).toEqual(["id", "luxCeiling", "model", "name", "note", "type"]);
  });

  it("US-EQU-12 a stranger sees the same as a friend of a friend who shares nothing: an empty list (P-05)", async () => {
    await set({ id: LAMP, share: "friends", note: null });
    expect((await view("cleo")).devices).toEqual([]);
  });

  it("US-EQU-12 'Everything private' suspends the sharing without deleting it", async () => {
    await set({ id: LAMP, share: "friends", note: null });
    everythingPrivate.add("anna");
    expect((await view("ben")).devices).toEqual([]);
    everythingPrivate.delete("anna");
    expect((await view("ben")).devices).toHaveLength(1);
  });

  it("US-EQU-12 only own equipment can be shared (P-04); a note on private or too long is refused", async () => {
    const foreign = await set({ id: LAMP, share: "friends", note: null }, "ben");
    expect(foreign).toMatchObject({ ok: false, error: { code: "equipment.not_found" } });
    expect(await set({ id: LAMP, share: "private", note: "x" })).toMatchObject({ ok: false });
    expect(await set({ id: LAMP, share: "friends", note: "x".repeat(301) })).toMatchObject({
      ok: false,
      error: { code: "input.invalid" },
    });
    expect((await equipmentSharing({ sharing }, "anna")).shared).toEqual([]);
  });
});
