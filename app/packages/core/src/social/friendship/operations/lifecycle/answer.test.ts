import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../../kernel/test-helpers";
import { friendAnswer, friendInvite, friendList, friendRequest, friendRequests } from "../../index";
import { fixedRandom, InMemoryFriends } from "../../test-helpers";

const anna = { userId: "anna" };
const ben = { userId: "ben" };
const NOW = new Date("2026-10-06T10:00:00.000Z");

let friends: InMemoryFriends;
let idem: InMemoryIdempotencyStore;
let counter = 0;
const deps = () => ({ idempotency: idem });

// Ben redeems a code of Anna: Anna has an incoming request.
async function requested(seed = 1) {
  const code = await execute(
    friendInvite({ friends, random: fixedRandom(seed), now: () => NOW }),
    deps(),
    { context: anna, input: {}, idempotencyKey: `i${++counter}` },
  );
  if (!code.ok) throw new Error("no code");
  await execute(friendRequest({ friends }), deps(), {
    context: ben,
    input: { code: code.value.code },
    idempotencyKey: `r${++counter}`,
  });
  const incoming = (await friendRequests({ friends }, "anna")).incoming[0];
  return incoming?.id as string;
}
const answer = (requestId: unknown, decision: unknown, context = anna) =>
  execute(friendAnswer({ friends }), deps(), {
    context,
    input: { requestId, decision },
    idempotencyKey: `a${++counter}`,
  });
const errorOf = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error?.code);

beforeEach(() => {
  friends = new InMemoryFriends({ anna: "Anna", ben: "Ben" }, () => NOW);
  idem = new InMemoryIdempotencyStore();
});

describe("US-SOZ-02 answer a friendship request", () => {
  it("US-SOZ-02 accepting makes the friendship effective on both sides", async () => {
    const id = await requested();
    expect(await answer(id, "accept")).toMatchObject({ ok: true, value: { status: "confirmed" } });
    expect((await friendList({ friends }, "anna")).friends).toMatchObject([{ name: "Ben" }]);
    expect((await friendList({ friends }, "ben")).friends).toMatchObject([{ name: "Anna" }]);
    expect(await friendRequests({ friends }, "anna")).toEqual({ incoming: [], outgoing: [] });
    expect(await friendRequests({ friends }, "ben")).toEqual({ incoming: [], outgoing: [] });
  });

  it("US-SOZ-02 declining discards silently: nothing for the receiver, only 'not accepted' for the sender", async () => {
    const id = await requested();
    expect(await answer(id, "decline")).toMatchObject({ ok: true, value: { status: "declined" } });
    expect(await friendRequests({ friends }, "anna")).toEqual({ incoming: [], outgoing: [] });
    const sender = await friendRequests({ friends }, "ben");
    expect(sender.outgoing).toMatchObject([{ status: "declined", otherName: "Anna" }]);
    expect((await friendList({ friends }, "ben")).friends).toEqual([]);
  });

  it("US-SOZ-02 a declined sender can ask again with a new code", async () => {
    await answer(await requested(), "decline");
    const second = await requested(2);
    expect(second).toBeTruthy();
    expect((await friendRequests({ friends }, "ben")).outgoing).toMatchObject([
      { status: "requested" },
    ]);
  });

  it("US-SOZ-02 answering the same way twice writes nothing; the other way is refused", async () => {
    const id = await requested();
    await answer(id, "accept");
    const writes = friends.writes;
    expect(await answer(id, "accept")).toMatchObject({ ok: true });
    expect(friends.writes).toBe(writes);
    expect(errorOf(await answer(id, "decline"))).toBe("friend.request_answered");
  });

  it("US-SOZ-02 only the receiver can answer: the sender and a stranger get not found (P-04)", async () => {
    await requested();
    const sent = (await friendRequests({ friends }, "ben")).outgoing[0]?.id;
    expect(errorOf(await answer(sent, "accept", ben))).toBe("friend.request_not_found");
    const id = (await friendRequests({ friends }, "anna")).incoming[0]?.id;
    expect(errorOf(await answer(id, "accept", { userId: "cleo" }))).toBe(
      "friend.request_not_found",
    );
    expect(friends.rows.every((r) => r.status === "requested")).toBe(true);
  });

  it("US-SOZ-02 an unknown id and bad input are refused without writing", async () => {
    await requested();
    const writes = friends.writes;
    expect(errorOf(await answer("nope", "accept"))).toBe("input.invalid");
    expect(errorOf(await answer("00000000-0000-4000-8000-000000000099", "maybe"))).toBe(
      "input.invalid",
    );
    expect(errorOf(await answer("00000000-0000-4000-8000-000000000099", "accept"))).toBe(
      "friend.request_not_found",
    );
    expect(friends.writes).toBe(writes);
  });

  it("US-SOZ-02 before acceptance only the display name is visible, no collection data", async () => {
    await requested();
    const incoming = (await friendRequests({ friends }, "anna")).incoming[0];
    expect(Object.keys(incoming ?? {}).sort()).toEqual([
      "direction",
      "id",
      "otherName",
      "requestedAt",
      "status",
    ]);
  });
});
