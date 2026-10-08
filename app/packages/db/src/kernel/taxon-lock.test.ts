import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { holdTaxonLock, openFixturePool } from "./index.ts";

let admin: Pool;
beforeAll(() => {
  admin = openFixturePool();
});
afterAll(async () => {
  await admin.end();
});

const TRY_LOCK = "select pg_try_advisory_lock(hashtext('pflanzendex-test-taxon')) as got";

describe("US-QG-07 the shared taxon lock serializes test files that change the catalog fingerprint (#646)", () => {
  it("US-QG-07 blocks a second holder until the first one releases", async () => {
    const release = await holdTaxonLock(admin);
    const other = await admin.connect();
    try {
      expect((await other.query<{ got: boolean }>(TRY_LOCK)).rows[0]?.got).toBe(false);
      await release();
      const second = (await other.query<{ got: boolean }>(TRY_LOCK)).rows[0]?.got;
      expect(second).toBe(true);
      await other.query("select pg_advisory_unlock(hashtext('pflanzendex-test-taxon'))");
    } finally {
      other.release();
    }
  });
});
