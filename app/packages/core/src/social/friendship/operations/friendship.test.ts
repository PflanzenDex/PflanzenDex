import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import { friendInvite, friendRequest, friendRequests } from "../index";
import { fixedRandom, InMemoryFriends } from "../test-helpers";

const anna = { userId: "anna" };
const ben = { userId: "ben" };
const NOW = new Date("2026-10-06T10:00:00.000Z");
const DAY = 86_400_000;

let friends: InMemoryFriends;
let idem: InMemoryIdempotencyStore;
let clock: Date;
let counter = 0;

const invite = (context = anna, seed = 1) =>
  execute(
    friendInvite({ friends, random: fixedRandom(seed), now: () => clock }),
    { idempotency: idem },
    { context, input: {}, idempotencyKey: `i${++counter}` },
  );
const request = (code: unknown, context = ben, key = `r${++counter}`) =>
  execute(
    friendRequest({ friends }),
    { idempotency: idem },
    { context, input: { code }, idempotencyKey: key },
  );
const codeOf = async (context = anna, seed = 1) => {
  const r = await invite(context, seed);
  if (!r.ok) throw new Error("no code");
  return r.value.code;
};
const errorOf = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error?.code);

beforeEach(() => {
  clock = new Date(NOW);
  friends = new InMemoryFriends({ anna: "Anna", ben: "Ben" }, () => clock);
  idem = new InMemoryIdempotencyStore();
});

describe("US-SOZ-01 request a friendship", () => {
  it("US-SOZ-01 invite creates a code that expires after 7 days and is shown once", async () => {
    const r = await invite();
    expect(r).toMatchObject({
      ok: true,
      value: { expiresAt: new Date(+NOW + 7 * DAY).toISOString() },
    });
    expect(r.ok ? r.value.code : "").toMatch(/^[0-9A-HJKMNP-TV-Z-]{29}$/);
    expect((r.ok ? r.value.code : "").split("-")).toHaveLength(6);
  });

  it("US-SOZ-01 redeeming sends a request with the display name to the inviter, not yet a friendship", async () => {
    const code = await codeOf();
    expect(await request(code)).toMatchObject({
      ok: true,
      value: { otherName: "Anna", direction: "sent" },
    });
    const incoming = await friendRequests({ friends }, "anna");
    expect(incoming.incoming).toMatchObject([{ otherName: "Ben", direction: "received" }]);
    expect(incoming.outgoing).toEqual([]);
    expect(friends.rows.every((r) => r.status === "requested")).toBe(true);
  });

  it("US-SOZ-01 a code typed with look-alikes, spaces and lower case still works", async () => {
    const code = await codeOf();
    expect(await request(code.toLowerCase().replaceAll("-", " "))).toMatchObject({ ok: true });
  });

  it("US-SOZ-01 a code is single-use: a second person is rejected", async () => {
    const code = await codeOf();
    await request(code);
    const r = await request(code, { userId: "cleo" });
    expect(errorOf(r)).toBe("friend.code_used");
  });

  it("US-SOZ-01 redeeming the same code again as the same account returns the request and writes nothing", async () => {
    const code = await codeOf();
    await request(code);
    const writes = friends.writes;
    expect(await request(code)).toMatchObject({ ok: true, value: { otherName: "Anna" } });
    expect(friends.writes).toBe(writes);
  });

  it("US-SOZ-01 an expired code is rejected clearly", async () => {
    const code = await codeOf();
    clock = new Date(+NOW + 7 * DAY);
    expect(errorOf(await request(code))).toBe("friend.code_expired");
    expect(friends.rows).toEqual([]);
  });

  it("US-SOZ-01 a code the system does not know is rejected, also when it is not even a code", async () => {
    expect(errorOf(await request("0000-0000-0000-0000-0000-0000"))).toBe("friend.unknown_code");
    expect(errorOf(await request("hello"))).toBe("friend.unknown_code");
    expect(errorOf(await request(42))).toBe("input.invalid");
  });

  it("US-SOZ-01 no self-invitation, and the code stays usable for someone else", async () => {
    const code = await codeOf();
    expect(errorOf(await request(code, anna))).toBe("friend.own_code");
    expect(await request(code)).toMatchObject({ ok: true });
  });

  it("US-SOZ-01 a duplicate request creates no second one and does not use the code up", async () => {
    await request(await codeOf(anna, 1));
    const second = await codeOf(anna, 2);
    expect(errorOf(await request(second))).toBe("friend.already_linked");
    expect(friends.rows).toHaveLength(2);
    expect(friends.codes.get(second.replaceAll("-", ""))?.redeemedBy).toBeNull();
  });

  it("US-SOZ-01 a request in the other direction counts as a duplicate", async () => {
    await request(await codeOf(anna, 1));
    expect(errorOf(await request(await codeOf(ben, 2), anna))).toBe("friend.already_linked");
  });

  it("US-SOZ-01 a request is visible only to its two sides (P-04, P-05)", async () => {
    await request(await codeOf());
    expect(await friendRequests({ friends }, "cleo")).toEqual({ incoming: [], outgoing: [] });
    expect((await friendRequests({ friends }, "ben")).outgoing).toHaveLength(1);
  });

  it("US-SOZ-01 a missing display name stays unknown instead of invented (P-08)", async () => {
    friends = new InMemoryFriends({ anna: null, ben: null }, () => clock);
    await request(await codeOf());
    expect((await friendRequests({ friends }, "anna")).incoming[0]?.otherName).toBeNull();
  });

  it("US-SOZ-01 invite and request need a signed-in account", async () => {
    const anonymous = { userId: null };
    const r = await execute(
      friendRequest({ friends }),
      { idempotency: idem },
      { context: anonymous, input: { code: "x" }, idempotencyKey: "k" },
    );
    expect(errorOf(r)).toBe("access.not_signed_in");
  });
});
