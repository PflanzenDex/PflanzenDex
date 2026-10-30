import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { holdTaxonLock, openFixturePool } from "../kernel/index.ts";

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

  it("US-QG-01 approving files share the lock and do not queue behind each other (#994)", async () => {
    const releases = await Promise.all([1, 2, 3].map(() => holdTaxonLock(admin)));
    const other = await admin.connect();
    try {
      expect((await other.query<{ got: boolean }>(TRY_LOCK)).rows[0]?.got).toBe(false);
    } finally {
      other.release();
      for (const release of releases) await release();
    }
  });

  it("US-QG-01 an exclusive holder (taxon table owner) excludes shared holders until it releases", async () => {
    const release = await holdTaxonLock(admin, "exclusive");
    const other = await admin.connect();
    try {
      const shared =
        "select pg_try_advisory_lock_shared(hashtext('pflanzendex-test-taxon')) as got";
      expect((await other.query<{ got: boolean }>(shared)).rows[0]?.got).toBe(false);
      await release();
      expect((await other.query<{ got: boolean }>(shared)).rows[0]?.got).toBe(true);
      await other.query("select pg_advisory_unlock_shared(hashtext('pflanzendex-test-taxon'))");
    } finally {
      other.release();
    }
  });

  it("US-QG-01 an exclusive request polls instead of queueing, so shared requests are not held back (#994)", async () => {
    const releaseShared = await holdTaxonLock(admin);
    let exclusive: (() => Promise<void>) | undefined;
    const waiting = holdTaxonLock(admin, "exclusive").then((release) => (exclusive = release));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(exclusive).toBeUndefined();
    const releaseSecond = await holdTaxonLock(admin); // does not wait behind the pending exclusive request
    await releaseSecond();
    await releaseShared();
    await waiting;
    expect(exclusive).toBeDefined();
    await exclusive?.();
  });
});
