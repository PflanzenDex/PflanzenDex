import { beforeEach, describe, expect, it } from "vitest";
import type { FriendStore } from "../../friendship";
import { InMemoryFacts, InMemoryPrivacy, InMemorySharing } from "../../sharing/test-helpers";
import { daysBetween } from "./derive";
import { friendFeed } from "../index";

const TODAY = "2026-10-06";
type Facts = ConstructorParameters<typeof InMemoryFacts>[0];
const spec = (
  id: string,
  latin: string | null,
  caughtAt: string | null,
  extra: { isCutting?: boolean } = {},
) => ({
  id,
  speciesLatin: latin,
  speciesGerman: latin ? `${latin} (de)` : null,
  name: id,
  caughtAt,
  isCutting: extra.isCutting ?? false,
});

let sharing: InMemorySharing;
let privacy: InMemoryPrivacy;
let facts: Facts;
const friends = {
  async friends() {
    return [
      { id: "f-anna", name: "Anna", since: "2026-01-01T00:00:00.000Z", accountId: "anna" },
      { id: "f-ben", name: "Ben", since: "2026-01-01T00:00:00.000Z", accountId: "ben" },
    ];
  },
} as unknown as FriendStore;
const feed = (q: Partial<Parameters<typeof friendFeed>[2]> = {}) =>
  friendFeed(
    {
      friends,
      sharing,
      privacy,
      facts: new InMemoryFacts(facts),
      now: () => new Date("2026-10-06T10:00:00Z"),
    },
    "me",
    {
      today: TODAY,
      ...q,
    },
  );
const share = (owner: string, ...ids: string[]) => sharing.setMany(owner, ids, true, false);

beforeEach(() => {
  sharing = new InMemorySharing();
  privacy = new InMemoryPrivacy();
  sharing.friends.add("me>anna");
  sharing.friends.add("me>ben");
  facts = {};
});

describe("US-SOZ-05 new among friends", () => {
  it("US-SOZ-05 lists events newest first with friend, species, date and type", async () => {
    facts = {
      a1: spec("a1", "Aloe vera", "2026-10-01"),
      b1: spec("b1", "Ficus lyrata", "2026-10-04"),
    };
    await share("anna", "a1");
    await share("ben", "b1");
    const { events } = await feed();
    expect(events.map((e) => [e.friendName, e.speciesLatin, e.date, e.type, e.count])).toEqual([
      ["Ben", "Ficus lyrata", "2026-10-04", "new_species", 1],
      ["Anna", "Aloe vera", "2026-10-01", "new_species", 1],
    ]);
  });

  it("US-SOZ-05 only shared specimens create events; private ones never do (P-05)", async () => {
    facts = { a1: spec("a1", "Aloe vera", "2026-10-01"), a2: spec("a2", "Ficus", "2026-10-02") };
    await share("anna", "a1");
    expect((await feed()).events.map((e) => e.speciesLatin)).toEqual(["Aloe vera"]);
  });

  it("US-SOZ-05 types: the first specimen of a species is new species, later ones new specimen, cuttings new cutting", async () => {
    facts = {
      a1: spec("a1", "Aloe vera", "2026-09-20"),
      a2: spec("a2", "Aloe vera", "2026-10-02"),
      a3: spec("a3", "Aloe vera", "2026-10-03", { isCutting: true }),
    };
    await share("anna", "a1", "a2", "a3");
    expect((await feed()).events.map((e) => [e.date, e.type])).toEqual([
      ["2026-10-03", "new_cutting"],
      ["2026-10-02", "new_specimen"],
      ["2026-09-20", "new_species"],
    ]);
  });

  it("US-SOZ-05 sharing an old specimen creates no event 'new today': it carries its real date and drops out of the period", async () => {
    facts = { a1: spec("a1", "Aloe vera", "2024-03-01") };
    await share("anna", "a1");
    expect((await feed()).events).toEqual([]);
    expect((await feed({ days: 1000 })).events[0]?.date).toBe("2024-03-01");
  });

  it("US-SOZ-05 events of one friend, species, day and type are summarized", async () => {
    facts = {
      a1: spec("a1", "Aloe vera", "2026-10-02"),
      a2: spec("a2", "Aloe vera", "2026-10-02"),
      a3: spec("a3", "Aloe vera", "2026-10-02"),
    };
    await share("anna", "a1", "a2", "a3");
    const { events } = await feed();
    expect(events.map((e) => [e.type, e.count])).toEqual([["new_species", 3]]);
  });

  it("US-SOZ-05 the period is 30 days by default and counts calendar days (today and 29 days back)", async () => {
    facts = {
      a1: spec("a1", "A", "2026-09-07"),
      a2: spec("a2", "B", "2026-09-06"),
    };
    await share("anna", "a1", "a2");
    expect((await feed()).events.map((e) => e.speciesLatin)).toEqual(["A"]);
    expect((await feed({ days: 31 })).events).toHaveLength(2);
  });

  it("US-SOZ-05 a missing date stays unknown, comes last and is never guessed (P-08, P-10)", async () => {
    facts = { a1: spec("a1", "A", null), b1: spec("b1", "B", "2026-10-05") };
    await share("anna", "a1");
    await share("ben", "b1");
    const { events } = await feed();
    expect(events.map((e) => e.date)).toEqual(["2026-10-05", null]);
  });

  it("US-SOZ-05 filters by friend and by 'only new species'", async () => {
    facts = {
      a1: spec("a1", "A", "2026-10-01"),
      a2: spec("a2", "A", "2026-10-02"),
      b1: spec("b1", "B", "2026-10-03"),
    };
    await share("anna", "a1", "a2");
    await share("ben", "b1");
    expect((await feed({ friendId: "f-ben" })).events.map((e) => e.friendName)).toEqual(["Ben"]);
    const only = await feed({ onlyNewSpecies: true });
    expect(only.events.every((e) => e.type === "new_species")).toBe(true);
    expect(only.events).toHaveLength(2);
  });

  it("US-SOZ-05 a species unknown to friends is never 'new species' (P-05)", async () => {
    facts = { a1: spec("a1", null, "2026-10-01") };
    await share("anna", "a1");
    expect((await feed()).events[0]).toMatchObject({ type: "new_specimen", speciesLatin: null });
  });

  it("US-SOZ-05 'Everything private' and withdrawn friendships hide the events", async () => {
    facts = { a1: spec("a1", "A", "2026-10-01") };
    await share("anna", "a1");
    privacy.on.add("anna");
    expect((await feed()).events).toEqual([]);
    privacy.on.delete("anna");
    sharing.friends.delete("me>anna");
    expect((await feed()).events).toEqual([]);
  });

  it("US-SOZ-05 every state says what to do next (P-09)", async () => {
    facts = { a1: spec("a1", "A", "2026-10-01") };
    const none = await friendFeed(
      {
        friends: { friends: async () => [] } as unknown as FriendStore,
        sharing,
        privacy,
        facts: new InMemoryFacts(facts),
        now: () => new Date("2026-10-06T10:00:00Z"),
      },
      "me",
      { today: TODAY },
    );
    expect(none.hint.nextAction).toMatch(/Code/);
    expect((await feed()).hint.text).toMatch(/noch nichts freigegeben/);
    await share("anna", "a1");
    expect((await feed()).hint.nextAction).toMatch(/Sammlung/);
    expect((await feed({ days: 1 })).hint.text).toMatch(/nichts Neues/);
  });
});

describe("US-SOZ-05 calendar arithmetic", () => {
  it("US-SOZ-05 counts whole calendar days across the daylight-saving switch of 2026-03-29", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-06", "2026-10-06")).toBe(0);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
  });
});
