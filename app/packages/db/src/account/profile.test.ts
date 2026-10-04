import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withAccount, migrate, openPool } from "../kernel/index.ts";

describe("US-ACC-02 · Profile and settings", () => {
  let pool: Pool;
  const testAccounts: string[] = [];

  beforeAll(async () => {
    pool = openPool();
    await migrate(pool);
  });

  afterAll(async () => {
    if (testAccounts.length > 0) {
      await pool.query("delete from account where id = any($1)", [testAccounts]);
    }
    await pool.end();
  });

  async function createTestAccount(email: string): Promise<string> {
    const accountId = randomUUID();
    testAccounts.push(accountId);
    await withAccount(pool, accountId, (c) =>
      c.query("insert into account (id) values ($1)", [accountId]),
    );
    await withAccount(pool, accountId, (c) =>
      c.query(`insert into account_data (account_id, email) values ($1, $2)`, [accountId, email]),
    );
    return accountId;
  }

  describe("Display name", () => {
    it("allows setting a display name", async () => {
      const accountId = await createTestAccount("user1@example.test");

      await withAccount(pool, accountId, async (client) => {
        await client.query(`update account_data set display_name = $1 where account_id = $2`, [
          "Alice",
          accountId,
        ]);
        const result = await client.query(
          `select display_name from account_data where account_id = $1`,
          [accountId],
        );
        expect(result.rows[0].display_name).toBe("Alice");
      });
    });

    it("returns null when display name is not set", async () => {
      const accountId = await createTestAccount("user2@example.test");

      await withAccount(pool, accountId, async (client) => {
        const result = await client.query(
          `select display_name from account_data where account_id = $1`,
          [accountId],
        );
        expect(result.rows[0].display_name).toBeNull();
      });
    });

    it("isolates display names between accounts", async () => {
      const account1 = await createTestAccount("account1@example.test");
      const account2 = await createTestAccount("account2@example.test");

      await withAccount(pool, account1, async (client) => {
        await client.query(`update account_data set display_name = $1 where account_id = $2`, [
          "Alice",
          account1,
        ]);
      });

      await withAccount(pool, account2, async (client) => {
        const result = await client.query(
          `select display_name from account_data where account_id = $1`,
          [account2],
        );
        expect(result.rows[0].display_name).toBeNull();
      });
    });
  });

  describe("Time zone", () => {
    it("allows setting a time zone", async () => {
      const accountId = await createTestAccount("tz1@example.test");

      await withAccount(pool, accountId, async (client) => {
        await client.query(`update account_data set time_zone = $1 where account_id = $2`, [
          "Europe/Berlin",
          accountId,
        ]);
        const result = await client.query(
          `select time_zone from account_data where account_id = $1`,
          [accountId],
        );
        expect(result.rows[0].time_zone).toBe("Europe/Berlin");
      });
    });

    it("returns null when time zone is not set", async () => {
      const accountId = await createTestAccount("tz2@example.test");

      await withAccount(pool, accountId, async (client) => {
        const result = await client.query(
          `select time_zone from account_data where account_id = $1`,
          [accountId],
        );
        expect(result.rows[0].time_zone).toBeNull();
      });
    });

    it("isolates time zones between accounts", async () => {
      const account1 = await createTestAccount("tz3@example.test");
      const account2 = await createTestAccount("tz4@example.test");

      await withAccount(pool, account1, async (client) => {
        await client.query(`update account_data set time_zone = $1 where account_id = $2`, [
          "Europe/Berlin",
          account1,
        ]);
      });

      await withAccount(pool, account2, async (client) => {
        const result = await client.query(
          `select time_zone from account_data where account_id = $1`,
          [account2],
        );
        expect(result.rows[0].time_zone).toBeNull();
      });
    });
  });

  describe("Everything private switch", () => {
    it("allows setting everything_private to true", async () => {
      const accountId = await createTestAccount("priv1@example.test");

      await withAccount(pool, accountId, async (client) => {
        await client.query(
          `update account_data set everything_private = true where account_id = $1`,
          [accountId],
        );
        const result = await client.query(
          `select everything_private from account_data where account_id = $1`,
          [accountId],
        );
        expect(result.rows[0].everything_private).toBe(true);
      });
    });

    it("defaults to false for everything_private", async () => {
      const accountId = await createTestAccount("priv2@example.test");

      await withAccount(pool, accountId, async (client) => {
        const result = await client.query(
          `select everything_private from account_data where account_id = $1`,
          [accountId],
        );
        expect(result.rows[0].everything_private).toBe(false);
      });
    });

    it("isolates everything_private between accounts", async () => {
      const account1 = await createTestAccount("priv3@example.test");
      const account2 = await createTestAccount("priv4@example.test");

      await withAccount(pool, account1, async (client) => {
        await client.query(
          `update account_data set everything_private = true where account_id = $1`,
          [account1],
        );
      });

      await withAccount(pool, account2, async (client) => {
        const result = await client.query(
          `select everything_private from account_data where account_id = $1`,
          [account2],
        );
        expect(result.rows[0].everything_private).toBe(false);
      });
    });
  });

  describe("No recommendations switch", () => {
    it("allows setting no_recommendations to true", async () => {
      const accountId = await createTestAccount("rec1@example.test");

      await withAccount(pool, accountId, async (client) => {
        await client.query(
          `update account_data set no_recommendations = true where account_id = $1`,
          [accountId],
        );
        const result = await client.query(
          `select no_recommendations from account_data where account_id = $1`,
          [accountId],
        );
        expect(result.rows[0].no_recommendations).toBe(true);
      });
    });

    it("defaults to false for no_recommendations", async () => {
      const accountId = await createTestAccount("rec2@example.test");

      await withAccount(pool, accountId, async (client) => {
        const result = await client.query(
          `select no_recommendations from account_data where account_id = $1`,
          [accountId],
        );
        expect(result.rows[0].no_recommendations).toBe(false);
      });
    });

    it("isolates no_recommendations between accounts", async () => {
      const account1 = await createTestAccount("rec3@example.test");
      const account2 = await createTestAccount("rec4@example.test");

      await withAccount(pool, account1, async (client) => {
        await client.query(
          `update account_data set no_recommendations = true where account_id = $1`,
          [account1],
        );
      });

      await withAccount(pool, account2, async (client) => {
        const result = await client.query(
          `select no_recommendations from account_data where account_id = $1`,
          [account2],
        );
        expect(result.rows[0].no_recommendations).toBe(false);
      });
    });
  });

  describe("Notification settings", () => {
    it("allows setting notification preferences", async () => {
      const accountId = await createTestAccount("notif1@example.test");

      const preferences = {
        phase: { enabled: true, time: "08:00", quietHours: null },
        treatment: { enabled: true, time: "08:00", quietHours: null },
        measurement: { enabled: false, time: null, quietHours: null },
        watering: { enabled: true, time: "08:00", quietHours: null },
        swap: { enabled: true, time: "08:00", quietHours: null },
        friends: { enabled: true, time: "08:00", quietHours: null },
      };

      await withAccount(pool, accountId, async (client) => {
        await client.query(
          `update account_data set notification_settings = $1 where account_id = $2`,
          [JSON.stringify(preferences), accountId],
        );
        const result = await client.query(
          `select notification_settings from account_data where account_id = $1`,
          [accountId],
        );
        expect(result.rows[0].notification_settings).toEqual(preferences);
      });
    });

    it("returns null when notification settings are not set", async () => {
      const accountId = await createTestAccount("notif2@example.test");

      await withAccount(pool, accountId, async (client) => {
        const result = await client.query(
          `select notification_settings from account_data where account_id = $1`,
          [accountId],
        );
        expect(result.rows[0].notification_settings).toBeNull();
      });
    });
  });

  describe("Updated_at timestamp", () => {
    it("updates the updated_at timestamp when settings are changed", async () => {
      const accountId = await createTestAccount("ts@example.test");

      // Get the initial timestamp
      let initialUpdatedAt: Date;
      await withAccount(pool, accountId, async (client) => {
        const result = await client.query(
          `select updated_at from account_data where account_id = $1`,
          [accountId],
        );
        initialUpdatedAt = new Date(result.rows[0].updated_at);
      });

      // Wait a bit to ensure the new timestamp will be different (need at least 1ms difference)
      await new Promise((r) => setTimeout(r, 1000));

      // Update the display name
      await withAccount(pool, accountId, async (client) => {
        await client.query(`update account_data set display_name = $1 where account_id = $2`, [
          "Bob",
          accountId,
        ]);
      });

      // Check that the timestamp was updated
      await withAccount(pool, accountId, async (client) => {
        const result = await client.query(
          `select updated_at from account_data where account_id = $1`,
          [accountId],
        );
        const newUpdatedAt = new Date(result.rows[0].updated_at);
        expect(newUpdatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
      });
    });
  });
});
