import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../kernel/operation";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { wishCreate, wishZoneUsage } from "./index";
import { InMemoryWishes } from "./test-helpers";

const ZONE = "00000000-0000-4000-8000-0000000000a3";
const FOREIGN_ZONE = "00000000-0000-4000-8000-0000000000b3";
const anna = { userId: "anna" };

let wishes: InMemoryWishes;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const create = (input: unknown, context = anna, key = `k${++counter}`) =>
  execute(wishCreate({ wishes }), { idempotency: idem }, { context, input, idempotencyKey: key });
const input = (extra: Record<string, unknown> = {}) => ({ name: "Haworthia fasciata", ...extra });
const errorOf = (r: Awaited<ReturnType<typeof create>>) => (r.ok ? null : r.error);

beforeEach(() => {
  wishes = new InMemoryWishes({ anna: [ZONE], ben: [FOREIGN_ZONE] });
  idem = new InMemoryIdempotencyStore();
});

describe("US-WUN-01 record a wish (FR-WUN-01, FR-WUN-04, FR-WUN-06)", () => {
  it("US-WUN-01 stores the wish as an open plant wish with all given fields", async () => {
    const r = await create(
      input({
        german: "  Zebra-Haworthie ",
        targetZoneId: ZONE,
        difficulty: 2,
        reasoning: "Bleibt klein.",
        imageUrl: "https://example.test/h.jpg",
        imageSource: "Wikimedia Commons",
        license: "CC BY-SA 4.0",
      }),
    );
    expect(r).toMatchObject({
      ok: true,
      value: {
        name: "Haworthia fasciata",
        german: "Zebra-Haworthie",
        targetZoneId: ZONE,
        difficulty: 2,
        reasoning: "Bleibt klein.",
        imageUrl: "https://example.test/h.jpg",
        imageSource: "Wikimedia Commons",
        license: "CC BY-SA 4.0",
        type: "plant",
        status: "wishlist",
      },
    });
  });

  it("US-WUN-01 only the name is required; everything else stays unknown instead of guessed (P-08)", async () => {
    expect(await create(input())).toMatchObject({
      ok: true,
      value: {
        german: null,
        targetZoneId: null,
        difficulty: null,
        reasoning: null,
        imageUrl: null,
        imageSource: null,
        license: null,
      },
    });
  });

  it.each([
    ["no name", { name: undefined }],
    ["an empty name", { name: "  " }],
    ["a name over 120 characters", { name: "x".repeat(121) }],
    ["difficulty 0", { difficulty: 0 }],
    ["difficulty 4", { difficulty: 4 }],
    ["difficulty 1.5", { difficulty: 1.5 }],
    ["a target zone that is no id", { targetZoneId: "zone-3" }],
    ["an image without its source", { imageUrl: "https://example.test/h.jpg" }],
    [
      "an image that is not https",
      { imageUrl: "http://example.test/h.jpg", imageSource: "Wikimedia Commons" },
    ],
    ["a source without an image", { imageSource: "Wikimedia Commons" }],
    [
      "an image address with credentials",
      { imageUrl: "https://user:secret@example.test/h.jpg", imageSource: "Wikimedia Commons" },
    ],
    [
      "an image address that is only a user name",
      { imageUrl: "https://user@example.test/h.jpg", imageSource: "Wikimedia Commons" },
    ],
    [
      "an image address with a blank",
      { imageUrl: "https://example.test/h 1.jpg", imageSource: "Wikimedia Commons" },
    ],
  ])("US-WUN-01 refuses %s and writes nothing", async (_label, extra) => {
    const r = await create(input(extra));
    expect(errorOf(r)?.code).toBe("input.invalid");
    expect(wishes.writes).toBe(0);
  });

  it("US-WUN-01 names the invalid field in the details", async () => {
    const r = await create(input({ difficulty: 4 }));
    expect(errorOf(r)?.details).toEqual([{ field: "difficulty", code: "input.invalid" }]);
  });

  it("US-WUN-01 a duplicate name is refused, also in another letter case (FR-WUN-06)", async () => {
    await create(input());
    const r = await create(input({ name: "HAWORTHIA FASCIATA" }));
    expect(errorOf(r)?.code).toBe("wish.name_taken");
    expect(wishes.rows).toHaveLength(1);
  });

  it("US-WUN-01 a duplicate that differs only in diacritics or Unicode composition is refused (FR-WUN-06)", async () => {
    await create(input({ name: "Café Pflanze" }));
    for (const name of ["Cafe  Pflanze", "Cafe Pflanze", "CAFÉ PFLANZE", "Cafe\u0301 Pflanze"]) {
      const r = await create(input({ name }));
      expect(errorOf(r)?.code).toBe("wish.name_taken");
    }
    expect(wishes.rows).toHaveLength(1);
  });

  it("US-WUN-01 names that really differ are no duplicates", async () => {
    await create(input({ name: "Haworthia fasciata" }));
    expect(await create(input({ name: "Haworthia fasciataa" }))).toMatchObject({ ok: true });
  });

  it("US-WUN-01 the same name in another account is no duplicate (P-04)", async () => {
    await create(input());
    expect(await create(input(), { userId: "ben" })).toMatchObject({ ok: true });
  });

  it("US-WUN-01 a zone of another account looks like an unknown zone (P-04)", async () => {
    const r = await create(input({ targetZoneId: FOREIGN_ZONE }));
    expect(errorOf(r)?.code).toBe("light_zone.not_found");
    expect(wishes.rows).toHaveLength(0);
  });

  it("US-WUN-01 the same Idempotency-Key writes once (US-QS-03)", async () => {
    await create(input(), anna, "same");
    await create(input(), anna, "same");
    expect(wishes.rows).toHaveLength(1);
  });
});

describe("US-WUN-01 zone usage: a zone a wish points to is not deleted unnoticed (P-10)", () => {
  it("US-WUN-01 names the wishes of the account that use the zone, whatever their status", async () => {
    await create(input({ targetZoneId: ZONE }));
    wishes.seed("anna", { id: "w9", name: "Gekauft", targetZoneId: ZONE, status: "bought" });
    wishes.seed("anna", { id: "w8", name: "Anderswo", targetZoneId: "elsewhere" });
    const users = await wishZoneUsage({ wishes }).user("anna", ZONE);
    expect(users).toEqual([
      { kind: "wish", id: "w1", name: "Haworthia fasciata" },
      { kind: "wish", id: "w9", name: "Gekauft" },
    ]);
  });

  it("US-WUN-01 names nothing of another account (P-04)", async () => {
    await create(input({ targetZoneId: ZONE }));
    expect(await wishZoneUsage({ wishes }).user("ben", ZONE)).toEqual([]);
  });
});
