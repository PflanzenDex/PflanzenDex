import { beforeEach, describe, expect, it } from "vitest";
import { ERROR_TEXTS, execute } from "../kernel";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import {
  INVITATION_VALIDITY_DAYS,
  invitationCreate,
  newInvitationCode,
  normalizeInvitationCode,
  operatorOverview,
  registrationSetMode,
  registerWithInvitation,
} from "./index";
import { InMemoryAccess } from "./test-helpers";

const NOW = new Date("2026-10-04T10:00:00.000Z");
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const isGroupedCode = (code: string) => {
  const groups = code.split("-");
  return (
    groups.length === 6 &&
    groups.every((g) => g.length === 4 && [...g].every((c) => ALPHABET.includes(c)))
  );
};
let access: InMemoryAccess;
let idem: InMemoryIdempotencyStore;
let counter = 0;
// Deterministic "randomness" that differs per call; the real source is the CSPRNG of the API.
const random = (n: number) =>
  Uint8Array.from({ length: n }, (_, i) => (i * 17 + ++counter * 31) % 256);
const deps = () => ({ access, random, now: () => NOW });

const create = (input: unknown, userId: string | null = "olga", key = `k${++counter}`) =>
  execute(
    invitationCreate(deps()),
    { idempotency: idem },
    { context: { userId }, input, idempotencyKey: key },
  );
const setMode = (input: unknown, userId: string | null = "olga", key = `k${++counter}`) =>
  execute(
    registrationSetMode({ access }),
    { idempotency: idem },
    { context: { userId }, input, idempotencyKey: key },
  );

beforeEach(() => {
  access = new InMemoryAccess({ olga: ["operator"], rita: ["reviewer"], kai: [] });
  idem = new InMemoryIdempotencyStore();
});

describe("US-ACC-05 · invitation codes are unguessable and easy to type", () => {
  it("US-ACC-05 a code has 120 bits in six groups of four characters without look-alike letters", () => {
    const code = newInvitationCode(random);
    expect(isGroupedCode(code)).toBe(true);
  });

  it("US-ACC-05 asks the randomness port for exactly 15 bytes and uses every one of them", () => {
    const asked: number[] = [];
    const a = newInvitationCode((n) => (asked.push(n), new Uint8Array(n).fill(0)));
    const b = newInvitationCode((n) => new Uint8Array(n).fill(255));
    const c = newInvitationCode(() =>
      Uint8Array.from({ length: 15 }, (_, i) => (i === 14 ? 1 : 0)),
    );
    expect(asked).toEqual([15]);
    expect(a).toBe("0000-0000-0000-0000-0000-0000");
    expect(b).toBe("ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ");
    expect(c).toBe("0000-0000-0000-0000-0000-0001");
  });

  it("US-ACC-05 two codes from different random input differ", () => {
    expect(newInvitationCode(random)).not.toBe(newInvitationCode(random));
  });

  it("US-ACC-05 refuses random input of the wrong length instead of producing a short code", () => {
    expect(() => newInvitationCode(() => new Uint8Array(3))).toThrow("15 random bytes");
  });

  it.each([
    ["abcd-efgh-jkmn-pqrs-tvwx-yz01", "ABCDEFGHJKMNPQRSTVWXYZ01"],
    ["  ABCD EFGH JKMN PQRS TVWX YZ01 ", "ABCDEFGHJKMNPQRSTVWXYZ01"],
    ["OOOO-IIII-LLLL-0000-1111-0000", "000011111111000011110000"],
  ])("US-ACC-05 normalizes %j", (raw, expected) => {
    expect(normalizeInvitationCode(raw)).toBe(expected);
  });

  it.each([
    [""],
    ["ABCD"],
    ["ABCD-EFGH-JKMN-PQRS-TVWX-YZ0U"],
    ["ABCD-EFGH-JKMN-PQRS-TVWX-YZ012"],
    [42],
    [null],
    [undefined],
  ])("US-ACC-05 rejects the malformed code %j", (raw) => {
    expect(normalizeInvitationCode(raw)).toBeNull();
  });

  it("US-ACC-05 survives a very long hostile input in linear time", () => {
    const started = Date.now();
    expect(normalizeInvitationCode("A-".repeat(200_000))).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("US-ACC-05 · only the operator creates invitation codes", () => {
  it("US-ACC-05 the operator gets a code once; the store receives it normalized with an UTC expiry (default 7 days)", async () => {
    const r = await create({});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.expiresAt).toBe("2026-10-11T10:00:00.000Z");
    expect(isGroupedCode(r.value.code)).toBe(true);
    expect(access.invitations).toHaveLength(1);
    expect(access.invitations[0]?.code).toBe(r.value.code.replaceAll("-", ""));
    expect(access.invitations[0]?.createdBy).toBe("olga");
  });

  it.each([[1], [30]])("US-ACC-05 accepts a validity of %d days", async (days) => {
    const r = await create({ validForDays: days });
    expect(r.ok && r.value.expiresAt).toBe(
      new Date(NOW.getTime() + days * 86_400_000).toISOString(),
    );
  });

  it.each([[0], [31], [1.5], ["7"], [-1]])(
    "US-ACC-05 refuses the validity %j and writes nothing",
    async (days) => {
      const r = await create({ validForDays: days });
      expect(!r.ok && r.error.code).toBe("input.invalid");
      expect(access.invitations).toHaveLength(0);
    },
  );

  it("US-ACC-05 documents the limits", () => {
    expect(INVITATION_VALIDITY_DAYS).toEqual({ min: 1, default: 7, max: 30 });
  });

  it.each([["kai"], ["rita"], ["unknown"]])(
    "US-ACC-05 %s (no operator) gets access.denied and nothing is written",
    async (who) => {
      const r = await create({}, who);
      expect(!r.ok && r.error.code).toBe("access.denied");
      expect(access.invitations).toHaveLength(0);
    },
  );

  it("US-ACC-05 without sign-in: access.not_signed_in", async () => {
    const r = await create({}, null);
    expect(!r.ok && r.error.code).toBe("access.not_signed_in");
  });

  it("US-ACC-05 the same idempotency key writes one invitation and returns the same answer", async () => {
    const a = await create({}, "olga", "same");
    const b = await create({}, "olga", "same");
    expect(a).toEqual(b);
    expect(access.invitations).toHaveLength(1);
  });
});

describe("US-ACC-05 · the operator switches registration by invitation", () => {
  it("US-ACC-05 switches on and off", async () => {
    const on = await setMode({ invitationOnly: true });
    expect(on.ok && on.value).toEqual({ invitationOnly: true });
    expect(access.invitationOnly).toBe(true);
    expect(access.modeSetBy).toEqual(["olga"]);
    const off = await setMode({ invitationOnly: false });
    expect(off.ok && off.value).toEqual({ invitationOnly: false });
  });

  it.each([[undefined], ["yes"], [1], [null]])("US-ACC-05 refuses %j", async (v) => {
    const r = await setMode({ invitationOnly: v });
    expect(!r.ok && r.error.code).toBe("input.invalid");
    expect(access.modeWrites).toBe(0);
  });

  it.each([["kai"], ["rita"]])("US-ACC-05 %s may not change the mode", async (who) => {
    const r = await setMode({ invitationOnly: true }, who);
    expect(!r.ok && r.error.code).toBe("access.denied");
    expect(access.modeWrites).toBe(0);
    expect(access.invitationOnly).toBe(false);
  });
});

describe("US-ACC-05 · the operator sees counts and no content", () => {
  it("US-ACC-05 shows accounts, active users and the cost per user as unknown (P-08)", async () => {
    access.accounts = 12;
    access.active = 5;
    const r = await operatorOverview({ access }, "olga");
    expect(access.overviewFor).toEqual(["olga"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      accounts: 12,
      activeAccounts: 5,
      activeWindowDays: 30,
      costPerUser: null,
      invitationOnly: false,
    });
  });

  it("US-ACC-05 carries only counts, the mode and invitation states: never an account, a code or plant data", async () => {
    await create({});
    const r = await operatorOverview({ access }, "olga");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.value).sort()).toEqual(
      [
        "accounts",
        "activeAccounts",
        "activeWindowDays",
        "costPerUser",
        "invitationOnly",
        "invitations",
      ].sort(),
    );
    for (const inv of r.value.invitations)
      expect(Object.keys(inv).sort()).toEqual([
        "createdAt",
        "expiresAt",
        "id",
        "redeemedAt",
        "status",
      ]);
  });

  it.each([["kai"], ["rita"], ["unknown"]])("US-ACC-05 %s gets access.denied", async (who) => {
    const r = await operatorOverview({ access }, who);
    expect(!r.ok && r.error.code).toBe("access.denied");
    expect(access.overviewReads).toBe(0);
  });
});

describe("US-ACC-05 · registration needs a valid, single-use code", () => {
  const code = async () => {
    const r = await create({});
    if (!r.ok) throw new Error("setup");
    return r.value.code;
  };
  const register = (subject: string, c: unknown) =>
    registerWithInvitation({ access })({ subject, code: c });

  it("US-ACC-05 a valid code registers the subject, typed in any case and grouping", async () => {
    const c = await code();
    const r = await register("sub-1", c.toLowerCase().replaceAll("-", " "));
    expect(r.ok && r.value).toEqual({ registered: true });
    expect(access.registered).toEqual(["sub-1"]);
  });

  it("US-ACC-05 a code works once: the second subject is refused", async () => {
    const c = await code();
    expect((await register("sub-1", c)).ok).toBe(true);
    const second = await register("sub-2", c);
    expect(!second.ok && second.error.code).toBe("invitation.invalid");
    expect(access.registered).toEqual(["sub-1"]);
  });

  it("US-ACC-05 unknown, used, expired and malformed codes all give the same error and text (no oracle)", async () => {
    const used = await code();
    await register("sub-1", used);
    const expired = await code();
    access.expire(expired);
    const errors = [];
    for (const c of [used, expired, "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA", "kaputt", "", null, 5]) {
      const r = await register("sub-x", c);
      errors.push(
        r.ok ? null : { code: r.error.code, text: r.error.text, details: r.error.details },
      );
    }
    expect(new Set(errors.map((e) => JSON.stringify(e))).size).toBe(1);
    expect(errors[0]?.code).toBe("invitation.invalid");
    expect(errors[0]?.text).toBe(ERROR_TEXTS["invitation.invalid"]);
    expect(access.registered).toEqual(["sub-1"]);
  });

  it("US-ACC-05 an account that already exists keeps its code unused", async () => {
    const c = await code();
    access.existing.add("sub-old");
    const r = await register("sub-old", c);
    expect(r.ok && r.value).toEqual({ registered: false });
    expect((await register("sub-new", c)).ok).toBe(true);
  });

  it("US-ACC-05 refuses a missing subject", async () => {
    const r = await register("", await code());
    expect(!r.ok && r.error.code).toBe("input.invalid");
  });
});
