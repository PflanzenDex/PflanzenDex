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
  async seenAt() {
    return this.value;
  }
  async markSeen(_u: string, upTo: string) {
    this.writes += 1;
    const capped = upTo > NOW.toISOString() ? NOW.toISOString() : upTo;
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
});
const banner = () => friendBanner({ friends, sharing, privacy, facts, seen, now: () => NOW }, "me");

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
    expect(await banner()).toMatchObject({ firstVisit: true, count: 0, items: [] });
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
