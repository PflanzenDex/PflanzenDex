import { beforeEach, describe, expect, it } from "vitest";
import { ERROR_TEXTS, execute } from "../kernel";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { accountUpdateProfile, defaultNotifications, REPLENISH_BUFFER_LIMITS } from "./index";
import { InMemoryProfiles } from "./test-helpers";

let profiles: InMemoryProfiles;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const save = (input: unknown, userId: string | null = "anna", key = `k${++counter}`) =>
  execute(
    accountUpdateProfile({ profiles }),
    { idempotency: idem },
    { context: { userId }, input, idempotencyKey: key },
  );
const valid = (extra: Record<string, unknown> = {}) => ({
  displayName: "Anna",
  timeZone: "Europe/Berlin",
  everythingPrivate: false,
  noRecommendations: false,
  notifications: {},
  ...extra,
});

beforeEach(() => {
  profiles = new InMemoryProfiles(["anna", "ben"]);
  idem = new InMemoryIdempotencyStore();
});

describe("US-ACC-02 · display name", () => {
  it("saves a free display name, not unique: two accounts may share it", async () => {
    const a = await save(valid({ displayName: "  Anna  " }));
    const b = await save(valid({ displayName: "Anna" }), "ben");
    expect(a.ok && a.value.displayName).toBe("Anna");
    expect(b.ok && b.value.displayName).toBe("Anna");
  });

  it("accepts no display name at all (null) while none was ever chosen", async () => {
    const r = await save(valid({ displayName: null }));
    expect(r.ok && r.value.displayName).toBeNull();
  });

  it.each([
    ["null", { displayName: null }],
    ["left out", { displayName: undefined }],
  ])("a display name that is %s keeps the stored name", async (_, change) => {
    await save(valid({ displayName: "Anna" }));
    const r = await save(valid({ ...change, timeZone: "UTC" }));
    expect(r.ok && r.value).toMatchObject({ displayName: "Anna", timeZone: "UTC" });
    expect(profiles.rows.get("anna")?.displayName).toBe("Anna");
  });

  it("saving the other settings without a name works and changes only the own account", async () => {
    await save(valid({ displayName: "Ben" }), "ben");
    const r = await save({ ...valid(), displayName: undefined, everythingPrivate: true });
    expect(r.ok && r.value.everythingPrivate).toBe(true);
    expect(profiles.rows.get("ben")?.displayName).toBe("Ben");
    expect(profiles.writtenFor).toEqual(["ben", "anna"]);
  });

  it("a name can still be changed to another non-empty one", async () => {
    await save(valid({ displayName: "Anna" }));
    const r = await save(valid({ displayName: "Anna B." }));
    expect(r.ok && r.value.displayName).toBe("Anna B.");
  });

  it.each([["   "], [""], ["x".repeat(81)], [42]])("refuses the display name %j", async (name) => {
    const r = await save(valid({ displayName: name }));
    expect(!r.ok && r.error.code).toBe("input.invalid");
    expect(!r.ok && r.error.details).toEqual([{ field: "displayName", code: "input.invalid" }]);
    expect(profiles.writes).toBe(0);
  });
});

describe("US-ACC-02 · time zone", () => {
  it.each([["Europe/Berlin"], ["America/New_York"], ["UTC"]])(
    "accepts the IANA name %s",
    async (zone) => {
      const r = await save(valid({ timeZone: zone }));
      expect(r.ok && r.value.timeZone).toBe(zone);
    },
  );

  it("stores none when none is given: the device decides until then", async () => {
    const r = await save(valid({ timeZone: null }));
    expect(r.ok && r.value.timeZone).toBeNull();
  });

  it.each([["Mars/Olympus"], ["+02:00"], ["Berlin"], [""], [7]])(
    "refuses the time zone %j",
    async (zone) => {
      const r = await save(valid({ timeZone: zone }));
      expect(!r.ok && r.error.details).toEqual([{ field: "timeZone", code: "input.invalid" }]);
      expect(profiles.writes).toBe(0);
    },
  );
});

describe("US-ACC-02 · notifications per occasion", () => {
  it("every occasion is on until it is switched off", async () => {
    const r = await save(valid({ notifications: {} }));
    expect(r.ok && r.value.notifications).toEqual(defaultNotifications());
  });

  it("switches single occasions off and keeps the others on", async () => {
    const r = await save(valid({ notifications: { treatment: false, swap: false } }));
    expect(r.ok && r.value.notifications).toEqual({
      phase: true,
      treatment: false,
      measurement: true,
      watering: true,
      swap: false,
      friends: true,
    });
  });

  it.each([
    [{ unknown: true }],
    [{ phase: "yes" }],
    [{ phase: { enabled: true } }],
    [["phase"]],
    ["all"],
  ])("refuses the notifications %j and does not drop them silently", async (n) => {
    const r = await save(valid({ notifications: n }));
    expect(!r.ok && r.error.details).toEqual([{ field: "notifications", code: "input.invalid" }]);
    expect(profiles.writes).toBe(0);
  });
});

describe("US-ACC-02 · global switches", () => {
  it("saves both switches", async () => {
    const r = await save(valid({ everythingPrivate: true, noRecommendations: true }));
    expect(r.ok && [r.value.everythingPrivate, r.value.noRecommendations]).toEqual([true, true]);
  });

  it.each([["everythingPrivate"], ["noRecommendations"]])(
    "refuses a non-boolean %s",
    async (field) => {
      const r = await save(valid({ [field]: "true" }));
      expect(!r.ok && r.error.details).toEqual([{ field, code: "input.invalid" }]);
    },
  );

  it("a missing switch is refused too: the profile is saved as a whole", async () => {
    const r = await save({ displayName: "Anna", timeZone: null, notifications: {} });
    expect(r.ok).toBe(false);
  });
});

describe("US-ACC-02 · writing rules (P-03, P-04)", () => {
  it("reports every invalid field at once with the German text", async () => {
    const r = await save(valid({ displayName: "", timeZone: "x/y" }));
    expect(!r.ok && r.error.details?.map((d) => d.field)).toEqual(["displayName", "timeZone"]);
    expect(!r.ok && r.error.text).toBe(ERROR_TEXTS["input.invalid"]);
  });

  it("needs a sign-in and writes nothing without one", async () => {
    const r = await save(valid(), null);
    expect(!r.ok && r.error.code).toBe("access.not_signed_in");
    expect(profiles.writes).toBe(0);
  });

  it("needs an Idempotency-Key", async () => {
    const r = await execute(
      accountUpdateProfile({ profiles }),
      { idempotency: idem },
      { context: { userId: "anna" }, input: valid(), idempotencyKey: undefined },
    );
    expect(!r.ok && r.error.code).toBe("idempotency.key_missing");
  });

  it("a repeat with the same key writes once", async () => {
    await save(valid(), "anna", "same");
    await save(valid(), "anna", "same");
    expect(profiles.writes).toBe(1);
  });

  it("changes only the own account: a foreign account id in the input is ignored", async () => {
    await save(valid({ displayName: "Anna", accountId: "ben", userId: "ben" }));
    expect(profiles.rows.get("anna")?.displayName).toBe("Anna");
    expect(profiles.rows.get("ben")?.displayName).toBeNull();
    expect(profiles.writtenFor).toEqual(["anna"]);
  });

  it("an account without data row is denied", async () => {
    const r = await save(valid(), "carla");
    expect(!r.ok && r.error.code).toBe("access.denied");
  });
});

describe("US-WUN-02 · the replenish buffer is an account setting", () => {
  it("is 2 until the keeper changes it", async () => {
    expect(profiles.rows.get("anna")?.replenishBuffer).toBe(REPLENISH_BUFFER_LIMITS.default);
    expect(REPLENISH_BUFFER_LIMITS).toEqual({ min: 0, max: 10, default: 2 });
  });

  it.each([0, 1, 5, 10])("saves the whole number %i", async (replenishBuffer) => {
    const r = await save(valid({ replenishBuffer }));
    expect(r.ok && r.value.replenishBuffer).toBe(replenishBuffer);
    expect(profiles.rows.get("anna")?.replenishBuffer).toBe(replenishBuffer);
  });

  it.each([-1, 11, 2.5, "3", Number.NaN, Number.POSITIVE_INFINITY, true])(
    "refuses %j and names the field, nothing is written",
    async (replenishBuffer) => {
      const r = await save(valid({ replenishBuffer }));
      expect(!r.ok && r.error.details).toEqual([
        { field: "replenishBuffer", code: "input.invalid" },
      ]);
      expect(profiles.writes).toBe(0);
    },
  );

  it.each([null, undefined])(
    "%s keeps the stored value, so an older client cannot reset it",
    async (v) => {
      await save(valid({ replenishBuffer: 4 }));
      const r = await save(valid({ replenishBuffer: v, timeZone: "UTC" }));
      expect(r.ok && r.value).toMatchObject({ replenishBuffer: 4, timeZone: "UTC" });
    },
  );

  it("changes only the own account", async () => {
    await save(valid({ replenishBuffer: 6 }), "ben");
    await save(valid({ replenishBuffer: 1 }));
    expect(profiles.rows.get("ben")?.replenishBuffer).toBe(6);
    expect(profiles.rows.get("anna")?.replenishBuffer).toBe(1);
  });
});
