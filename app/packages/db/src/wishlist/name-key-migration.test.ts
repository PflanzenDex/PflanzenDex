import { randomUUID } from "node:crypto";
import { copyFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, MIGRATIONS_DIRECTORY, openPool, testDatabaseUrl } from "../kernel/index.ts";
import { withAccount } from "../kernel/index.ts";

// US-WUN-01, FR-WUN-06: migration 0020 backfills the name key of existing wishes. Wishes that collide only after folding
// diacritics must not break it and must not be deleted (P-10). A scratch database is migrated up to 0019, filled, then
// migrated to the end (real PostgreSQL, `make db-up`).
const DB = `wish_key_${randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 8)}`;
const [anna, ben] = [randomUUID(), randomUUID()];
let admin: pg.Pool;
let scratch: pg.Pool;

const insert = (account: string, name: string, createdAt: string) =>
  withAccount(scratch, account, (c) =>
    c.query("insert into wish (account_id, name, created_at) values ($1, $2, $3)", [
      account,
      name,
      createdAt,
    ]),
  );

beforeAll(async () => {
  admin = openPool();
  await admin.query(`create database ${DB}`);
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${DB}`;
  scratch = openPool(url.toString());
  scratch.on("error", () => undefined);
  const before = mkdtempSync(join(tmpdir(), "wish-key-"));
  for (const f of readdirSync(MIGRATIONS_DIRECTORY).filter((n) => n < "0020"))
    copyFileSync(join(MIGRATIONS_DIRECTORY, f), join(before, f));
  await migrate(scratch, { directory: before });
  for (const id of [anna, ben])
    await withAccount(scratch, id, (c) => c.query("insert into account (id) values ($1)", [id]));
  await insert(anna, "Café", "2026-01-01T10:00:00Z");
  await insert(anna, "Cafe", "2026-01-02T10:00:00Z"); // collides only after folding
  await insert(anna, "Aloe vera", "2026-01-03T10:00:00Z");
  await insert(ben, "Cafe", "2026-01-04T10:00:00Z");
});
afterAll(async () => {
  await scratch.end();
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.end();
});

const names = (account: string) =>
  withAccount(scratch, account, (c) =>
    c.query<{ name: string; key: string | null }>(
      "select name, name_key as key from wish order by created_at",
    ),
  ).then((r) => r.rows);

describe("US-WUN-01 migration 0020 backfills the name key", () => {
  it("US-WUN-01 applies although wishes collide after folding, deletes nothing and keys the others", async () => {
    const applied = await migrate(scratch);
    expect(applied).toEqual(["0020_wishlist_wish_name_key.sql"]);
    expect(await names(anna)).toEqual([
      { name: "Café", key: "cafe" },
      { name: "Cafe", key: null },
      { name: "Aloe vera", key: "aloe vera" },
    ]);
    expect(await names(ben)).toEqual([{ name: "Cafe", key: "cafe" }]);
  });

  it("US-WUN-01 a second run applies nothing, and the new rule holds for new wishes of the account only (P-04)", async () => {
    expect(await migrate(scratch)).toEqual([]);
    const add = (account: string, name: string, key: string) =>
      withAccount(scratch, account, (c) =>
        c.query("insert into wish (account_id, name, name_key) values ($1, $2, $3)", [
          account,
          name,
          key,
        ]),
      );
    await expect(add(anna, "Cafe\u0301", "cafe")).rejects.toMatchObject({
      constraint: "wish_name_key",
    });
    await expect(add(ben, "Cafe Ben", "cafe ben")).resolves.toBeTruthy();
  });

  it("US-WUN-01 the previous app version still inserts wishes without a key (backwards compatible)", async () => {
    await expect(
      withAccount(scratch, anna, (c) =>
        c.query("insert into wish (account_id, name) values ($1, 'Alt A')", [anna]),
      ),
    ).resolves.toBeTruthy();
    await expect(
      withAccount(scratch, anna, (c) =>
        c.query("insert into wish (account_id, name) values ($1, 'ALT A')", [anna]),
      ),
    ).rejects.toMatchObject({ constraint: "wish_name" });
  });
});
