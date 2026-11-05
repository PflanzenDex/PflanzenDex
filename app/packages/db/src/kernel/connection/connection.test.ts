import { describe, expect, it } from "vitest";
import {
  createFileDatabase,
  openAdminPool,
  openPool,
  testDatabaseUrl,
  testOwnerUrl,
} from "./connection.ts";

// QG-D1 (#1301, #1365): the database that one test file gets for itself, in real PostgreSQL (`make db-up`). The api suite
// uses it; this file tests it in the db suite, which measures the coverage of the db package.
const nameOf = (url: string): string => new URL(url).pathname.slice(1);

describe("QG-D1 createFileDatabase: a database of its own for one test file", () => {
  it("QG-D1 the database is owned by the test owner role: the owner URL runs as that plain role, the fixture URL as the superuser", async () => {
    const file = await createFileDatabase("qgd1_owner");
    const name = nameOf(file.ownerUrl);
    const admin = openAdminPool();
    const owner = openPool(file.ownerUrl);
    const fixture = openPool(file.fixtureUrl, true);
    try {
      const row = await admin.query<{ owner: string }>(
        "select pg_get_userbyid(datdba) as owner from pg_database where datname = $1",
        [name],
      );
      expect(row.rows[0]?.owner).toBe(new URL(testOwnerUrl()).username);
      const asOwner = await owner.query<{ who: string; db: string; super: boolean }>(
        `select current_user as who, current_database() as db,
           (select rolsuper from pg_roles where rolname = current_user) as super`,
      );
      expect(asOwner.rows[0]).toEqual({
        who: new URL(testOwnerUrl()).username,
        db: name,
        super: false,
      });
      const asFixture = await fixture.query<{ who: string; db: string; super: boolean }>(
        `select current_user as who, current_database() as db,
           (select rolsuper from pg_roles where rolname = current_user) as super`,
      );
      expect(asFixture.rows[0]).toEqual({
        who: new URL(testDatabaseUrl()).username,
        db: name,
        super: true,
      });
    } finally {
      await owner.end();
      await fixture.end();
      await admin.end();
      await file.drop();
    }
  });

  it("QG-D1 every call gets a name of its own, under the prefix, and the fixture URL names the same database", async () => {
    const first = await createFileDatabase("qgd1_names");
    const second = await createFileDatabase("qgd1_names");
    try {
      expect(nameOf(first.ownerUrl)).toMatch(/^qgd1_names_[a-z]{10}$/);
      expect(nameOf(second.ownerUrl)).toMatch(/^qgd1_names_[a-z]{10}$/);
      expect(nameOf(first.ownerUrl)).not.toBe(nameOf(second.ownerUrl));
      expect(nameOf(first.fixtureUrl)).toBe(nameOf(first.ownerUrl));
    } finally {
      await first.drop();
      await second.drop();
    }
  });

  it("QG-D1 drop() removes the database from the server", async () => {
    const file = await createFileDatabase("qgd1_drop");
    const name = nameOf(file.ownerUrl);
    await file.drop();
    const admin = openAdminPool();
    try {
      const left = await admin.query("select 1 from pg_database where datname = $1", [name]);
      expect(left.rowCount).toBe(0);
    } finally {
      await admin.end();
    }
  });
});
