import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureSpecimen } from "../fixtures.ts";
import { ZonePostgres } from "../light/index.ts";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../kernel/index.ts";
import { WishesPostgres } from "./index.ts";

// US-WUN-01, DM-WUN-01, P-04: wishes per account (real PostgreSQL, `make db-up`).
let pool: Pool;
// Deliberate cross-tenant observation/cleanup of FORCE-d tables: needs the superuser, the suite owner is under row security (#294).
let admin: Pool;
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
const IMAGE = {
  object: "img-1.jpg",
  source: "Anna, https://commons.wikimedia.org/wiki/File:A.jpg",
  license: "CC BY 4.0",
};

async function zone(account: string, name: string): Promise<string> {
  const z = await zones.create(account, { name, luxCeiling: 15000, ppfd: null, sortOrder: null });
  if (typeof z === "string") throw new Error(z);
  return z.id;
}

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  wishes = new WishesPostgres(pool);
  zones = new ZonePostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
  zoneAnna = await zone(anna, "Lampe 3");
  zoneBen = await zone(ben, "Lampe 3");
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await admin.end();
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
    await admin.query("update wish set status = 'bought' where id = $1", [bought.id]);
    await admin.query("update wish set status = 'discarded' where id = $1", [dropped.id]);
    const names = (await wishes.open(anna)).map((w) => w.name);
    expect(names).not.toContain("Gekauft");
    expect(names).not.toContain("Verworfen");
    expect(
      (
        await admin.query("select count(*)::int as n from wish where id = any($1)", [
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
    await admin.query("update wish set status = 'bought' where id = $1", [w.id]);
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
    const id = (await admin.query("select id from wish where name = 'Bens Geheimtipp'")).rows[0].id;
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
    await admin.query("update wish set status = 'discarded' where id = $1", [w.id]);
    expect(await wishes.buy(anna, w.id)).toBe("not_open");
    expect(
      (await admin.query("select status from wish where id = $1", [w.id])).rows[0].status,
    ).toBe("discarded");
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

describe("US-WUN-05 from purchase to plant in the database", () => {
  const bought = async (account: string, name: string) => {
    const w = await wishes.create(account, values({ name }));
    if (typeof w === "string") throw new Error(w);
    await wishes.buy(account, w.id);
    return w;
  };

  it("US-WUN-05 a bought wish is linked to a specimen of the account and the link is read back", async () => {
    const w = await bought(anna, "Kauf mit Exemplar");
    const specimen = await createFixtureSpecimen(pool, anna, "Exemplar zum Kauf");
    expect(await wishes.link(anna, w.id, specimen)).toMatchObject({
      changed: true,
      wish: { specimenId: specimen, status: "bought" },
    });
    expect((await wishes.bought(anna)).find((x) => x.id === w.id)?.specimenId).toBe(specimen);
  });

  it("US-WUN-05 linking the same specimen again changes nothing; another specimen is already_linked", async () => {
    const w = await bought(anna, "Zweimal verknüpft");
    const one = await createFixtureSpecimen(pool, anna, "Verknüpft eins");
    const two = await createFixtureSpecimen(pool, anna, "Verknüpft zwei");
    await wishes.link(anna, w.id, one);
    expect(await wishes.link(anna, w.id, one)).toMatchObject({ changed: false });
    expect(await wishes.link(anna, w.id, two)).toBe("already_linked");
  });

  it("US-WUN-05 a specimen belongs to one wish only", async () => {
    const a = await bought(anna, "Eigentümer eins");
    const b = await bought(anna, "Eigentümer zwei");
    const specimen = await createFixtureSpecimen(pool, anna, "Geteiltes Exemplar");
    await wishes.link(anna, a.id, specimen);
    expect(await wishes.link(anna, b.id, specimen)).toBe("already_linked");
  });

  it("US-WUN-05 only a bought wish is linked", async () => {
    const w = await wishes.create(anna, values({ name: "Noch offen" }));
    if (typeof w === "string") throw new Error(w);
    const specimen = await createFixtureSpecimen(pool, anna, "Exemplar zum offenen Wunsch");
    expect(await wishes.link(anna, w.id, specimen)).toBe("not_bought");
    await expect(
      admin.query("update wish set specimen_id = $2 where id = $1", [w.id, specimen]),
    ).rejects.toMatchObject({ constraint: "wish_specimen_only_when_bought" });
  });

  it("US-WUN-05 a specimen or wish of another account looks unknown (P-04)", async () => {
    const mine = await bought(anna, "Mein Kauf");
    const theirs = await bought(ben, "Bens Kauf");
    const bensSpecimen = await createFixtureSpecimen(pool, ben, "Bens Exemplar");
    expect(await wishes.link(anna, mine.id, bensSpecimen)).toBe("specimen_unknown");
    expect(await wishes.link(anna, theirs.id, bensSpecimen)).toBe("not_found");
    expect(await wishes.link(anna, randomUUID(), bensSpecimen)).toBe("not_found");
  });

  it("US-WUN-05 an open wish becomes discarded, stays stored and readable; again changes nothing", async () => {
    const w = await wishes.create(anna, values({ name: "Zu verwerfen" }));
    if (typeof w === "string") throw new Error(w);
    expect(await wishes.discard(anna, w.id)).toMatchObject({
      changed: true,
      wish: { status: "discarded" },
    });
    expect((await wishes.open(anna)).map((x) => x.id)).not.toContain(w.id);
    expect((await wishes.discarded(anna)).map((x) => x.id)).toContain(w.id);
    expect(await wishes.discard(anna, w.id)).toMatchObject({ changed: false });
  });

  it("US-WUN-05 a bought wish is not_open for discarding; foreign or unknown is not_found (P-04)", async () => {
    const mine = await bought(anna, "Gekauft nicht verwerfbar");
    expect(await wishes.discard(anna, mine.id)).toBe("not_open");
    const theirs = await wishes.create(ben, values({ name: "Bens offener Wunsch" }));
    if (typeof theirs === "string") throw new Error(theirs);
    expect(await wishes.discard(anna, theirs.id)).toBe("not_found");
    expect(await wishes.discard(anna, randomUUID())).toBe("not_found");
    expect((await wishes.discarded(anna)).map((x) => x.id)).not.toContain(theirs.id);
    expect((await wishes.open(ben)).map((x) => x.id)).toContain(theirs.id);
  });
});

// FR-WUN-06 / #303: wishes without a name key (exempt since migration 0020) are found, renamed (which sets the key)
// or deleted, only by their own account. Such a row can only come from the migration, so the test inserts it as the
// migration left it.
describe("FR-WUN-06 #303 repair of key-less duplicate wishes", () => {
  const created = async (account: string, name: string) => {
    const w = await wishes.create(account, values({ name }));
    if (typeof w === "string") throw new Error(w);
    return w;
  };
  const keyless = async (account: string, name: string): Promise<string> => {
    const r = await withAccount(pool, account, (c) =>
      c.query<{ id: string }>(
        "insert into wish (account_id, name, name_key) values ($1, $2, null) returning id",
        [account, name],
      ),
    );
    return (r.rows[0] as { id: string }).id;
  };
  const keyOfRow = async (id: string) =>
    (await admin.query("select name_key from wish where id = $1", [id])).rows[0]?.name_key;

  it("FR-WUN-06 #303 lists only the open key-less wishes of the own account", async () => {
    const mine = await keyless(anna, "Doppelt A");
    const bought = await keyless(anna, "Doppelt gekauft");
    await wishes.buy(anna, bought);
    const theirs = await keyless(ben, "Doppelt B");
    await created(anna, "Regulär");
    const ids = (await wishes.keyless(anna)).map((w) => w.id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(bought);
    expect(ids).not.toContain(theirs);
    expect((await wishes.keyless(ben)).map((w) => w.id)).toContain(theirs);
  });

  it("FR-WUN-06 #303 rename sets the key, a taken name is name_taken and changes nothing", async () => {
    await created(anna, "Café Original");
    const id = await keyless(anna, "Cafe Original");
    expect(await wishes.rename(anna, id, "Cafe ORIGINAL", keyOf("Cafe ORIGINAL"))).toBe(
      "name_taken",
    );
    expect(await keyOfRow(id)).toBeNull();
    const r = await wishes.rename(anna, id, "Cafe Zwei", keyOf("Cafe Zwei"));
    expect(r).toMatchObject({ id, name: "Cafe Zwei" });
    expect(await keyOfRow(id)).toBe(keyOf("Cafe Zwei"));
    expect((await wishes.keyless(anna)).map((w) => w.id)).not.toContain(id);
  });

  it("FR-WUN-06 #303 a regular wish is not_duplicate for rename and remove and stays", async () => {
    const w = await created(anna, "Reguläre Pflanze");
    expect(await wishes.rename(anna, w.id, "Anders", keyOf("Anders"))).toBe("not_duplicate");
    expect(await wishes.remove(anna, w.id)).toBe("not_duplicate");
    expect((await wishes.open(anna)).find((x) => x.id === w.id)?.name).toBe("Reguläre Pflanze");
  });

  it("FR-WUN-06 #303 remove deletes the key-less wish and returns it", async () => {
    const id = await keyless(anna, "Zu löschen");
    expect(await wishes.remove(anna, id)).toMatchObject({ id, name: "Zu löschen" });
    expect((await admin.query("select 1 from wish where id = $1", [id])).rowCount).toBe(0);
    expect(await wishes.remove(anna, id)).toBe("not_found");
  });

  it("FR-WUN-06 #303 another account can neither rename nor delete it (P-04)", async () => {
    const id = await keyless(anna, "Annas Doppel");
    expect(await wishes.rename(ben, id, "Mein", keyOf("Mein"))).toBe("not_found");
    expect(await wishes.remove(ben, id)).toBe("not_found");
    expect(await wishes.rename(anna, randomUUID(), "X", "x")).toBe("not_found");
    expect((await admin.query("select name from wish where id = $1", [id])).rows[0].name).toBe(
      "Annas Doppel",
    );
  });
});

describe("US-WUN-04 the stored copy of a wish image", () => {
  it("records object, source and license on the wish and reads them back", async () => {
    const w = await wishes.create(
      anna,
      values({
        name: "Image wish",
        imageUrl: "https://commons.wikimedia.org/wiki/File:A.jpg",
        imageSource: "Wikipedia",
      }),
    );
    if (typeof w === "string") throw new Error(w);
    expect(w.imageObject).toBeNull();
    const updated = await wishes.setImage(anna, w.id, IMAGE);
    expect(updated).toMatchObject({
      imageObject: "img-1.jpg",
      imageSource: IMAGE.source,
      license: "CC BY 4.0",
    });
    expect(await wishes.find(anna, w.id)).toMatchObject({ imageObject: "img-1.jpg" });
  });

  it("tenant: another account neither finds nor changes the wish (P-04)", async () => {
    const w = await wishes.create(
      anna,
      values({
        name: "Private image",
        imageUrl: "https://commons.wikimedia.org/wiki/File:B.jpg",
        imageSource: "x",
      }),
    );
    if (typeof w === "string") throw new Error(w);
    expect(await wishes.find(ben, w.id)).toBeNull();
    expect(await wishes.setImage(ben, w.id, IMAGE)).toBeNull();
    expect((await wishes.find(anna, w.id))?.imageObject).toBeNull();
  });

  it("the database refuses an object name that is not a stored JPEG name", async () => {
    const w = await wishes.create(anna, values({ name: "Bad object" }));
    if (typeof w === "string") throw new Error(w);
    await expect(wishes.setImage(anna, w.id, { ...IMAGE, object: "../x.png" })).rejects.toThrow();
  });
});

describe("US-ENT-04 decision columns", () => {
  it("US-ENT-04 stores source, decision date and discarded status of a Discover decision, private to the account", async () => {
    const r = await wishes.create(
      anna,
      values({
        name: "Discover rara",
        source: "discover",
        decidedAt: "2026-10-03",
        status: "discarded",
      }),
    );
    expect(r).toMatchObject({ name: "Discover rara", status: "discarded" });
    const own = await withAccount(pool, anna, (c) =>
      c.query("select source, to_char(decided_at, 'YYYY-MM-DD') as d from wish where name = $1", [
        "Discover rara",
      ]),
    );
    expect(own.rows).toEqual([{ source: "discover", d: "2026-10-03" }]);
    const foreign = await withAccount(pool, ben, (c) =>
      c.query("select 1 from wish where name = $1", ["Discover rara"]),
    );
    expect(foreign.rows).toEqual([]);
    expect(await wishes.discarded(ben)).toEqual([]);
  });

  it("US-ENT-04 a wish written without a source is a manual wish without a decision date", async () => {
    await wishes.create(anna, values({ name: "Manuell rara" }));
    const r = await withAccount(pool, anna, (c) =>
      c.query("select source, decided_at from wish where name = $1", ["Manuell rara"]),
    );
    expect(r.rows).toEqual([{ source: "manual", decided_at: null }]);
  });
});
