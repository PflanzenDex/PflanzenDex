import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../../kernel/test-helpers";
import {
  friendAnswer,
  friendEnd,
  friendInvite,
  friendList,
  friendRequest,
  friendRequests,
} from "../../index";
import { fixedRandom, InMemoryFriends } from "../../test-helpers";

const anna = { userId: "anna" };
const ben = { userId: "ben" };
const NOW = new Date("2026-10-06T10:00:00.000Z");

let friends: InMemoryFriends;
let idem: InMemoryIdempotencyStore;
let counter = 0;
const deps = () => ({ idempotency: idem });
const run = <E, A>(
  op: Parameters<typeof execute<E, A>>[0],
  context: { userId: string },
  input: unknown,
) => execute(op, deps(), { context, input, idempotencyKey: `k${++counter}` });

/** Ben asks Anna with her code, Anna accepts: the id of Anna's friend row. */
async function befriend(seed = 1) {
  const code = await run(
    friendInvite({ friends, random: fixedRandom(seed), now: () => NOW }),
    anna,
    {},
  );
  if (!code.ok) throw new Error("no code");
  await run(friendRequest({ friends }), ben, { code: code.value.code });
  const incoming = (await friendRequests({ friends }, "anna")).incoming[0];
  await run(friendAnswer({ friends }), anna, { requestId: incoming?.id, decision: "accept" });
  return {
    anna: (await friendList({ friends }, "anna")).friends[0]?.id as string,
    ben: (await friendList({ friends }, "ben")).friends[0]?.id as string,
  };
}
const end = (friendId: unknown, context = anna) =>
  run(friendEnd({ friends }), context, { friendId });
const errorOf = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error?.code);

beforeEach(() => {
  friends = new InMemoryFriends({ anna: "Anna", ben: "Ben" }, () => NOW);
  idem = new InMemoryIdempotencyStore();
});

describe("US-SOZ-03 end a friendship", () => {
  it("US-SOZ-03 ending withdraws the friendship from both sides at once", async () => {
    const ids = await befriend();
    expect(await end(ids.anna)).toMatchObject({ ok: true, value: { status: "ended" } });
    expect((await friendList({ friends }, "anna")).friends).toEqual([]);
    expect((await friendList({ friends }, "ben")).friends).toEqual([]);
  });

  it("US-SOZ-03 either side can end it", async () => {
    const ids = await befriend();
    expect(await end(ids.ben, ben)).toMatchObject({ ok: true });
    expect((await friendList({ friends }, "anna")).friends).toEqual([]);
  });

  it("US-SOZ-03 ending twice writes nothing", async () => {
    const ids = await befriend();
    await end(ids.anna);
    const writes = friends.writes;
    expect(await end(ids.anna)).toMatchObject({ ok: true });
    expect(friends.writes).toBe(writes);
  });

  it("US-SOZ-03 a stranger, an unknown id and a request that is no friendship yet are not found (P-04)", async () => {
    const ids = await befriend();
    expect(errorOf(await end(ids.anna, { userId: "cleo" }))).toBe("friend.not_found");
    expect(errorOf(await end("00000000-0000-4000-8000-000000000099"))).toBe("friend.not_found");
    expect(errorOf(await end("nope"))).toBe("input.invalid");
    expect((await friendList({ friends }, "anna")).friends).toHaveLength(1);
  });

  it("US-SOZ-03 the friendship can be started again with a new code", async () => {
    const ids = await befriend();
    await end(ids.anna);
    expect(await befriend(2)).toBeTruthy();
    expect((await friendList({ friends }, "ben")).friends).toMatchObject([{ name: "Anna" }]);
  });
});
