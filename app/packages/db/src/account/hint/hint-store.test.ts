import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../../kernel/index.ts";
import { HintPostgres } from "./index.ts";

// US-ONB-07, DM-ONB-03, P-04: hints and the end of the guide per account (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
let store: HintPostgres;
const anna = randomUUID();
const ben = randomUUID();

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  store = new HintPostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) =>
      c.query("insert into account (id) values ($1) on conflict do nothing", [id]),
    );
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await admin.end();
  await pool.end();
});

describe("US-ONB-07 hints per account", () => {
  it("US-ONB-07 shows once, the first shown date stays, dismissal keeps its first date", async () => {
    expect(await store.show(anna, "first_plant_saved", "2026-10-01")).toEqual({
      occasion: "first_plant_saved",
      shownOn: "2026-10-01",
      dismissedOn: null,
    });
    await store.show(anna, "first_plant_saved", "2026-10-05");
    expect((await store.dismiss(anna, "first_plant_saved", "2026-10-06")).dismissedOn).toBe(
      "2026-10-06",
    );
    const again = await store.dismiss(anna, "first_plant_saved", "2026-10-09");
    expect(again).toEqual({
      occasion: "first_plant_saved",
      shownOn: "2026-10-01",
      dismissedOn: "2026-10-06",
    });
  });

  it("DM-ONB-03 a dismissal without a shown hint (the guide) is one row", async () => {
    const row = await store.dismiss(anna, "first_plant_guide", "2026-10-02");
    expect(row).toEqual({
      occasion: "first_plant_guide",
      shownOn: "2026-10-02",
      dismissedOn: "2026-10-02",
    });
  });

  it("US-ONB-07 nobody sees or changes the hints of another account (P-04, QG-D1)", async () => {
    expect(await store.list(ben)).toEqual([]);
    await store.dismiss(ben, "first_plant_guide", "2026-10-03");
    expect(
      (await store.list(anna)).find((r) => r.occasion === "first_plant_guide")?.dismissedOn,
    ).toBe("2026-10-02");
    expect(await store.list(ben)).toHaveLength(1);
  });

  it("US-ONB-07 the database refuses an occasion id that is not lowercase words", async () => {
    await expect(store.show(anna, "Bad Id", "2026-10-01")).rejects.toThrow();
  });
});
