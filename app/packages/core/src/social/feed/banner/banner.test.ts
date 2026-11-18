import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import type { FriendStore } from "../../friendship";
import { InMemoryFacts, InMemoryPrivacy, InMemorySharing } from "../../sharing/test-helpers";
import { feedMarkSeen, friendBanner, type FeedSeenStore } from "../index";

const NOW = new Date("2026-10-06T10:00:00.000Z");
const spec = (id: string, latin: string | null) => ({
  id,
  speciesLatin: latin,
  speciesGerman: latin ? `${latin} (de)` : null,
  name: id,
  caughtAt: "2020-01-01",
  isCutting: false,
});

class Seen implements FeedSeenStore {
  value: string | null = null;
  writes = 0;
  /** The store's clock: what `now()` answers and where `markSeen` caps (the database's `now()` in `db`). */
  clock = NOW.toISOString();
  async now() {
    return this.clock;
  }
  async seenAt() {
    return this.value;
  }
  async markSeen(_u: string, upTo: string) {
    this.writes += 1;
    const capped = upTo > this.clock ? this.clock : upTo;
    if (this.value === null || capped > this.value) this.value = capped;
    return this.value;
  }
}

let sharing: InMemorySharing;
let privacy: InMemoryPrivacy;
let seen: Seen;
let n = 0;
const friends = {
  async friends() {
    return [{ id: "f-anna", name: "Anna", since: "2026-01-01T00:00:00.000Z", accountId: "anna" }];
  },
} as unknown as FriendStore;
const facts = new InMemoryFacts({
  s1: spec("s1", "Aloe vera"),
  s2: spec("s2", "Aloe vera"),
  s3: spec("s3", null),
  s4: spec("s4", "Ficus elastica"),
});
const banner = () => friendBanner({ friends, sharing, privacy, facts, seen }, "me");

beforeEach(() => {
  sharing = new InMemorySharing();
  privacy = new InMemoryPrivacy();
  seen = new Seen();
  sharing.friends.add("me>anna");
  sharing.friendsSince.set("me>anna", "2026-09-01T00:00:00.000Z");
});

describe("US-SOZ-06 banner since my last visit", () => {
  it("US-SOZ-06 the first visit is silent: nothing is new, no matter what was shared before", async () => {
    await sharing.setMany("anna", ["s1"], true, false);
    expect(await banner()).toMatchObject({ firstVisit: true, count: 0, items: [], read: [] });
  });

  it("US-SOZ-06 counts what became visible after the last seen instant, per friend and species", async () => {
    seen.value = "2026-10-02T00:00:00.000Z";
    sharing.now = "2026-10-01T00:00:00.000Z";
    await sharing.setMany("anna", ["s1"], true, false);
    sharing.now = "2026-10-03T00:00:00.000Z";
    await sharing.setMany("anna", ["s2", "s3"], true, false);
    const b = await banner();
    expect(b).toMatchObject({ firstVisit: false, count: 2, asOf: NOW.toISOString() });
    expect(b.items.map((i) => [i.friendName, i.speciesLatin, i.count])).toEqual([
      ["Anna", "Aloe vera", 1],
      ["Anna", null, 1],
    ]);
    // What became visible before the last seen instant (s1, 2026-10-01) is not new; within the read window it is read.
    expect(b.read.map((i) => [i.speciesLatin, i.count])).toEqual([["Aloe vera", 1]]);
  });

  it("US-SOZ-06 read: what was new and got marked as seen comes back under 'read' with the same summary; count stays the new ones", async () => {
    seen.value = "2026-10-02T00:00:00.000Z";
    sharing.now = "2026-10-03T00:00:00.000Z";
    await sharing.setMany("anna", ["s1", "s3"], true, false);
    expect((await banner()).count).toBe(2);
    await seen.markSeen("me", NOW.toISOString());
    const b = await banner();
    expect(b).toMatchObject({ firstVisit: false, count: 0, items: [] });
    expect(b.read.map((i) => [i.friendName, i.speciesLatin, i.count])).toEqual([
      ["Anna", "Aloe vera", 1],
      ["Anna", null, 1],
    ]);
    expect(Object.keys(b.read[0] ?? {}).sort()).toEqual(
      ["count", "friendId", "friendName", "speciesGerman", "speciesLatin"].sort(),
    );
  });

  it("US-SOZ-06 read: a share older than the read window (7 days before now) is not read any more; one second inside it is", async () => {
    // NOW is 2026-10-06T10:00Z; the window is the 7 days before it (READ_DAYS, an assumption). The last seen instant is 2026-10-02.
    seen.value = "2026-10-02T00:00:00.000Z";
    sharing.now = "2026-09-20T00:00:00.000Z";
    await sharing.setMany("anna", ["s1"], true, false);
    sharing.now = "2026-09-29T10:00:00.000Z";
    await sharing.setMany("anna", ["s2"], true, false);
    sharing.now = "2026-09-29T10:00:01.000Z";
    await sharing.setMany("anna", ["s3"], true, false);
    sharing.now = "2026-10-03T00:00:00.000Z";
    await sharing.setMany("anna", ["s4"], true, false);
    const b = await banner();
    // s1 is 16 days old and s2 exactly 7 days: both out of "read"; s3 (one second inside) is read; s4 is new.
    expect(b.count).toBe(1);
    expect(b.items.map((i) => [i.speciesLatin, i.count])).toEqual([["Ficus elastica", 1]]);
    expect(b.read.map((i) => [i.speciesLatin, i.count])).toEqual([[null, 1]]);
  });

  it("US-SOZ-06 read follows the privacy rules too: nothing while 'Everything private' is on, nothing unshared, nothing after the friendship ended (P-05)", async () => {
    seen.value = "2026-10-02T00:00:00.000Z";
    sharing.now = "2026-10-01T00:00:00.000Z";
    await sharing.setMany("anna", ["s1", "s3"], true, false);
    await seen.markSeen("me", NOW.toISOString());
    expect((await banner()).read.map((i) => i.count)).toEqual([1, 1]);
    privacy.on.add("anna");
    expect(await banner()).toMatchObject({ count: 0, read: [] });
    privacy.on.delete("anna");
    expect((await banner()).read).toHaveLength(2);
    await sharing.setMany("anna", ["s3"], false, false);
    expect((await banner()).read.map((i) => i.speciesLatin)).toEqual(["Aloe vera"]);
    sharing.friends.delete("me>anna");
    expect(await banner()).toMatchObject({ count: 0, read: [] });
  });

  it("US-SOZ-06 an old specimen that is shared now is new to me; one that was visible before is not", async () => {
    seen.value = "2026-10-02T00:00:00.000Z";
    sharing.now = "2026-09-15T00:00:00.000Z";
    await sharing.setMany("anna", ["s1"], true, false);
    expect((await banner()).count).toBe(0);
    sharing.friendsSince.set("me>anna", "2026-10-05T00:00:00.000Z");
    expect((await banner()).count).toBe(1);
  });

  it("US-SOZ-06 shows nothing for private specimens, 'Everything private' or an ended friendship (P-05)", async () => {
    seen.value = "2026-10-02T00:00:00.000Z";
    sharing.now = "2026-10-03T00:00:00.000Z";
    await sharing.setMany("anna", ["s1"], true, false);
    privacy.on.add("anna");
    expect((await banner()).count).toBe(0);
    privacy.on.delete("anna");
    expect((await banner()).count).toBe(1);
    sharing.friends.delete("me>anna");
    expect((await banner()).count).toBe(0);
  });

  it("US-SOZ-06 'Okay' marks the feed as seen up to the instant it was read; it never moves back and never past now", async () => {
    const run = (upTo: unknown) =>
      execute(
        feedMarkSeen({ seen }),
        { idempotency: new InMemoryIdempotencyStore() },
        {
          context: { userId: "me" },
          input: { upTo },
          idempotencyKey: `k${++n}`,
        },
      );
    expect(await run("2026-10-04T00:00:00.000Z")).toMatchObject({
      ok: true,
      value: { seenAt: "2026-10-04T00:00:00.000Z" },
    });
    expect(await run("2026-10-03T00:00:00.000Z")).toMatchObject({
      value: { seenAt: "2026-10-04T00:00:00.000Z" },
    });
    expect(await run("2099-01-01T00:00:00.000Z")).toMatchObject({
      value: { seenAt: NOW.toISOString() },
    });
    expect(await run("yesterday")).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    expect(await run(5)).toMatchObject({ ok: false, error: { code: "input.invalid" } });
  });

  it("US-SOZ-06 asOf comes from the store's clock, so 'Okay' clears a share made just before the read even when the app clock lags the database (clock skew)", async () => {
    // The database runs 30 ms ahead of the API host (measured): the share and the read come after the app's NOW.
    seen.clock = "2026-10-06T10:00:00.030000Z";
    seen.value = "2026-10-02T00:00:00.000000Z";
    sharing.now = "2026-10-06T10:00:00.020000Z";
    await sharing.setMany("anna", ["s1"], true, false);
    const b = await banner();
    expect(b).toMatchObject({ firstVisit: false, count: 1, asOf: "2026-10-06T10:00:00.030000Z" });
    await seen.markSeen("me", b.asOf);
    expect((await banner()).count).toBe(0);
  });

  it("US-SOZ-06 instants are compared as instants: a share 0.5 s after the last seen instant is new, one 0.5 s before it is read", async () => {
    // The text of "...00.500Z" sorts before "...00Z"; the comparison must still say that the share came after the seen instant.
    seen.clock = "2026-11-18T10:05:00.000Z";
    seen.value = "2026-11-18T10:00:00Z";
    sharing.now = "2026-11-18T10:00:00.500Z";
    await sharing.setMany("anna", ["s1"], true, false);
    sharing.now = "2026-11-18T09:59:59.500Z";
    await sharing.setMany("anna", ["s3"], true, false);
    const b = await banner();
    expect(b.items.map((i) => [i.speciesLatin, i.count])).toEqual([["Aloe vera", 1]]);
    expect(b.read.map((i) => [i.speciesLatin, i.count])).toEqual([[null, 1]]);
    expect(b.count).toBe(1);
  });

  it("US-SOZ-06 what became visible after the read instant is still new after 'Okay'", async () => {
    seen.value = "2026-10-02T00:00:00.000Z";
    sharing.now = "2026-10-06T09:59:59.000Z";
    await sharing.setMany("anna", ["s1"], true, false);
    expect((await banner()).count).toBe(1);
    await seen.markSeen("me", "2026-10-06T09:00:00.000Z");
    expect((await banner()).count).toBe(1);
    await seen.markSeen("me", "2026-10-06T10:00:00.000Z");
    expect((await banner()).count).toBe(0);
  });
});
