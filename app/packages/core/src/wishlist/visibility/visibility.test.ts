import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { wishVisibility, wishVisibleList, type WishVisibilityStore } from "./index";

// DM-TAU-02, US-TAU-05, P-03, P-05: the owner marks a wish as visible to friends, per wish, and takes it back.
const OPEN = "00000000-0000-4000-8000-00000000a001";
const BOUGHT = "00000000-0000-4000-8000-00000000a002";
const BENS = "00000000-0000-4000-8000-00000000b001";
const anna = { userId: "anna" };

interface Row {
  userId: string;
  id: string;
  status: "wishlist" | "bought";
  visible: boolean;
}
let rows: Row[];
let writes: number;
const store: WishVisibilityStore = {
  async set(userId, wishId, visible) {
    const row = rows.find((r) => r.userId === userId && r.id === wishId);
    if (!row) return "not_found";
    if (visible && row.status !== "wishlist") return "not_open";
    const changed = row.visible !== visible;
    if (changed) writes += 1;
    row.visible = visible;
    return { wishId, visible, changed };
  },
  async flagged(userId) {
    return rows
      .filter((r) => r.userId === userId && r.visible && r.status === "wishlist")
      .map((r) => r.id);
  },
};
let idem: InMemoryIdempotencyStore;
let n = 0;
const set = (input: unknown, context: { userId: string | null } = anna) =>
  execute(
    wishVisibility({ visibility: store }),
    { idempotency: idem },
    { context, input, idempotencyKey: `k${++n}` },
  );
const boughtRow = () => rows.find((r) => r.id === BOUGHT) as Row;
const code = (r: Awaited<ReturnType<typeof set>>) => (r.ok ? null : r.error.code);

beforeEach(() => {
  idem = new InMemoryIdempotencyStore();
  writes = 0;
  rows = [
    { userId: "anna", id: OPEN, status: "wishlist", visible: false },
    { userId: "anna", id: BOUGHT, status: "bought", visible: true },
    { userId: "ben", id: BENS, status: "wishlist", visible: false },
  ];
});

describe("DM-TAU-02 wish flag visible to friends", () => {
  it("DM-TAU-02 a wish is private by default and only the owner's explicit call changes it", async () => {
    expect(await wishVisibleList({ visibility: store }, "anna")).toEqual({ wishIds: [] });
    const r = await set({ wishId: OPEN, visible: true });
    expect(r).toMatchObject({ ok: true, value: { visible: true, changed: true } });
    expect(await wishVisibleList({ visibility: store }, "anna")).toEqual({ wishIds: [OPEN] });
  });

  it("US-TAU-05 the flag can be taken back at any time, also for a bought wish", async () => {
    await set({ wishId: OPEN, visible: true });
    expect(await set({ wishId: OPEN, visible: false })).toMatchObject({
      ok: true,
      value: { visible: false },
    });
    expect(await set({ wishId: BOUGHT, visible: false })).toMatchObject({
      ok: true,
      value: { visible: false },
    });
    expect(await wishVisibleList({ visibility: store }, "anna")).toEqual({ wishIds: [] });
  });

  it("DM-TAU-02 setting the same value twice writes once (idempotent) and the answer names the effect", async () => {
    await set({ wishId: OPEN, visible: true });
    const again = await set({ wishId: OPEN, visible: true });
    expect(again).toMatchObject({ ok: true, value: { changed: false } });
    expect(writes).toBe(1);
    expect(again.ok && again.value.hint.text).toContain("Passt in beide Richtungen");
  });

  it("DM-TAU-02 a bought wish cannot be made visible: wish.not_open_for_friends", async () => {
    boughtRow().visible = false;
    expect(code(await set({ wishId: BOUGHT, visible: true }))).toBe("wish.not_open_for_friends");
    expect(boughtRow().visible).toBe(false);
  });

  it("P-04 a wish of another account looks unknown and stays untouched", async () => {
    expect(code(await set({ wishId: BENS, visible: true }))).toBe("wish.not_found");
    expect(rows[2]?.visible).toBe(false);
  });

  it("P-03 invalid input is refused with details and writes nothing", async () => {
    for (const input of [
      { wishId: OPEN },
      { wishId: OPEN, visible: "yes" },
      { wishId: "x", visible: true },
      null,
    ])
      expect(code(await set(input))).toBe("input.invalid");
    expect(writes).toBe(0);
  });
});
