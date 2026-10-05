import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZonePostgres } from "../light/index.ts";
import { migrate, openPool, withAccount } from "../kernel/index.ts";
import { WishesPostgres } from "./index.ts";

// US-WUN-01, DM-WUN-01, P-04: wishes per account (real PostgreSQL, `make db-up`).
let pool: Pool;
let wishes: WishesPostgres;
let zones: ZonePostgres;
const anna = randomUUID();
const ben = randomUUID();
let zoneAnna = "";
let zoneBen = "";
// The same fold as `wishNameKey` in core (db does not import core).
const keyOf = (name: string) =>
  [...name.normalize("NFD")]
    .filter((ch) => ch < "\u0300" || ch > "\u036f")
    .join("")
    .toLowerCase();
const values = (extra: Record<string, unknown> = {}) => {
  const all = {
    name: "Haworthia fasciata",
    ...base,
    ...extra,
  };
  return { nameKey: keyOf(String(all.name)), ...all };
};
const base = {
  german: null,
  targetZoneId: null,
  difficulty: null,
  reasoning: null,
  imageUrl: null,
  imageSource: null,
  license: null,
};

async function zone(account: string, name: string): Promise<string> {
  const z = await zones.create(account, { name, luxCeiling: 15000, ppfd: null, sortOrder: null });
  if (typeof z === "string") throw new Error(z);
  return z.id;
}

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  wishes = new WishesPostgres(pool);
  zones = new ZonePostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
  zoneAnna = await zone(anna, "Lampe 3");
  zoneBen = await zone(ben, "Lampe 3");
});
afterAll(async () => {
  await pool.query("delete from account where id = any($1)", [[anna, ben]]);
  await pool.end();
});

describe("US-WUN-01 wishes in the database", () => {
  it("stores a wish as an open plant wish and reads it back with all fields", async () => {
    const r = await wishes.create(
      anna,
      values({
        name: "Gasteria",
        german: "Ochsenzunge",
        targetZoneId: zoneAnna,
        difficulty: 2,
        reasoning: "Bleibt klein.",
        imageUrl: "https://example.test/g.jpg",
        imageSource: "Wikimedia Commons",
        license: "CC BY-SA 4.0",
      }),
    );
    expect(r).toMatchObject({
      name: "Gasteria",
      german: "Ochsenzunge",
      targetZoneId: zoneAnna,
      difficulty: 2,
      reasoning: "Bleibt klein.",
      imageUrl: "https://example.test/g.jpg",
      imageSource: "Wikimedia Commons",
      license: "CC BY-SA 4.0",
      type: "plant",
      status: "wishlist",
    });
    expect(await wishes.open(anna)).toEqual([r]);
  });

  it("refuses a duplicate name per account, also in another letter case, but not across accounts (FR-WUN-06)", async () => {
    expect(await wishes.create(anna, values({ name: "Aloe vera" }))).toMatchObject({
      name: "Aloe vera",
    });
    expect(await wishes.create(anna, values({ name: "ALOE VERA" }))).toBe("name_taken");
    expect(await wishes.create(ben, values({ name: "Aloe vera" }))).toMatchObject({
      name: "Aloe vera",
    });
  });

  it("US-WUN-01 refuses a duplicate that differs only in diacritics or composition (unique key, FR-WUN-06)", async () => {
    expect(await wishes.create(anna, values({ name: "Café Pflanze" }))).toMatchObject({
      name: "Café Pflanze",
    });
    expect(await wishes.create(anna, values({ name: "Cafe Pflanze" }))).toBe("name_taken");
    expect(await wishes.create(anna, values({ name: "Cafe\u0301 PFLANZE" }))).toBe("name_taken");
    expect(await wishes.create(ben, values({ name: "Cafe Pflanze" }))).toMatchObject({
      name: "Cafe Pflanze",
    });
  });

  it("refuses a target zone of another account as an unknown zone (composite foreign key, P-04)", async () => {
    expect(await wishes.create(anna, values({ name: "Fremd", targetZoneId: zoneBen }))).toBe(
      "zone_unknown",
    );
    expect(
      await wishes.create(anna, values({ name: "Erfunden", targetZoneId: randomUUID() })),
    ).toBe("zone_unknown");
  });

  it("shows only open wishes: bought and discarded ones leave the list but stay stored (FR-WUN-02)", async () => {
    const bought = await wishes.create(anna, values({ name: "Gekauft" }));
    const dropped = await wishes.create(anna, values({ name: "Verworfen" }));
    if (typeof bought === "string" || typeof dropped === "string") throw new Error("setup");
    await pool.query("update wish set status = 'bought' where id = $1", [bought.id]);
    await pool.query("update wish set status = 'discarded' where id = $1", [dropped.id]);
    const names = (await wishes.open(anna)).map((w) => w.name);
    expect(names).not.toContain("Gekauft");
    expect(names).not.toContain("Verworfen");
    expect(
      (
        await pool.query("select count(*)::int as n from wish where id = any($1)", [
          [bought.id, dropped.id],
        ])
      ).rows[0].n,
    ).toBe(2);
  });

  it("rejects values the database must not hold (checks): difficulty 4, an image without source, http", async () => {
    const bad = (extra: Record<string, unknown>) =>
      withAccount(pool, anna, (c) =>
        c.query(
          `insert into wish (account_id, name, difficulty, image_url, image_source)
           values ($1, $2, $3, $4, $5)`,
          [
            anna,
            `Check ${randomUUID()}`,
            extra["difficulty"] ?? null,
            extra["imageUrl"] ?? null,
            extra["imageSource"] ?? null,
          ],
        ),
      );
    await expect(bad({ difficulty: 4 })).rejects.toThrow();
    await expect(bad({ imageUrl: "https://example.test/x.jpg" })).rejects.toThrow();
    await expect(
      bad({ imageUrl: "http://example.test/x.jpg", imageSource: "x" }),
    ).rejects.toThrow();
    await expect(
      bad({ imageUrl: "https://user:pw@example.test/x.jpg", imageSource: "x" }),
    ).rejects.toThrow();
  });
});

describe("US-WUN-01 zone usage and tenant isolation (P-04, P-05)", () => {
  it("names the wishes of the account that point at a zone, whatever their status", async () => {
    const w = await wishes.create(anna, values({ name: "Zonenwunsch", targetZoneId: zoneAnna }));
    if (typeof w === "string") throw new Error("setup");
    await pool.query("update wish set status = 'bought' where id = $1", [w.id]);
    expect((await wishes.usingZone(anna, zoneAnna)).map((x) => x.name)).toContain("Zonenwunsch");
  });

  it("a zone in use cannot be deleted by the database (on delete restrict, nothing disappears silently)", async () => {
    expect(await zones.remove(anna, zoneAnna)).toBe("in_use");
    expect((await zones.list(anna)).map((z) => z.id)).toContain(zoneAnna);
  });

  it("never lists or names the wishes of another account", async () => {
    await wishes.create(ben, values({ name: "Bens Geheimtipp", targetZoneId: zoneBen }));
    expect((await wishes.open(anna)).map((w) => w.name)).not.toContain("Bens Geheimtipp");
    expect((await wishes.open(ben)).map((w) => w.name)).toContain("Bens Geheimtipp");
    expect(await wishes.usingZone(anna, zoneBen)).toEqual([]);
    expect((await wishes.usingZone(ben, zoneBen)).map((w) => w.name)).toEqual(["Bens Geheimtipp"]);
  });

  it("a wish of another account cannot be read or changed by SQL as account A", async () => {
    const id = (await pool.query("select id from wish where name = 'Bens Geheimtipp'")).rows[0].id;
    const read = await withAccount(pool, anna, (c) =>
      c.query("select * from wish where id = $1", [id]),
    );
    expect(read.rowCount).toBe(0);
    const change = await withAccount(pool, anna, (c) =>
      c.query("update wish set status = 'discarded' where id = $1", [id]),
    );
    expect(change.rowCount).toBe(0);
  });
});

describe("US-WUN-03 record a purchase in the database", () => {
  const created = async (account: string, name: string) => {
    const w = await wishes.create(account, values({ name }));
    if (typeof w === "string") throw new Error(w);
    return w;
  };

  it("US-WUN-03 'Bought' sets the status bought, hides the wish from the open list and keeps it in the history", async () => {
    const w = await created(anna, "Kaufwunsch");
    expect(await wishes.buy(anna, w.id)).toEqual({
      wish: { ...w, status: "bought" },
      changed: true,
    });
    expect((await wishes.open(anna)).map((x) => x.id)).not.toContain(w.id);
    expect((await wishes.bought(anna)).map((x) => x.id)).toContain(w.id);
  });

  it("US-WUN-03 buying again changes nothing (idempotent), also when two calls race", async () => {
    const w = await created(anna, "Doppelkauf");
    const [one, two] = await Promise.all([wishes.buy(anna, w.id), wishes.buy(anna, w.id)]);
    const changed = [one, two].map((r) => (typeof r === "string" ? r : r.changed));
    expect(changed.sort()).toEqual([false, true]);
    expect(await wishes.buy(anna, w.id)).toMatchObject({
      changed: false,
      wish: { status: "bought" },
    });
  });

  it("US-WUN-03 a discarded wish is not_open and stays discarded; an unknown id is not_found", async () => {
    const w = await created(anna, "Verworfener Kauf");
    await pool.query("update wish set status = 'discarded' where id = $1", [w.id]);
    expect(await wishes.buy(anna, w.id)).toBe("not_open");
    expect((await pool.query("select status from wish where id = $1", [w.id])).rows[0].status).toBe(
      "discarded",
    );
    expect(await wishes.buy(anna, randomUUID())).toBe("not_found");
  });

  it("US-WUN-03 a wish of another account looks unknown, stays open and is not in my history (P-04)", async () => {
    const w = await created(ben, "Bens Kaufwunsch");
    expect(await wishes.buy(anna, w.id)).toBe("not_found");
    expect((await wishes.open(ben)).map((x) => x.id)).toContain(w.id);
    await wishes.buy(ben, w.id);
    expect((await wishes.bought(anna)).map((x) => x.id)).not.toContain(w.id);
    expect((await wishes.bought(ben)).map((x) => x.id)).toContain(w.id);
  });
});
