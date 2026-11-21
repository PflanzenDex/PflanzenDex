import { afterEach, describe, expect, it, vi } from "vitest";
import { currentTimeZone, deviceTimeZone, setProfileTimeZone } from "../../shared/data";
import { loadProfile, saveProfile } from "./account-api";

const PROFILE = {
  displayName: "Anna",
  timeZone: "Europe/Berlin",
  everythingPrivate: true,
  noRecommendations: false,
  replenishBuffer: 2,
  positionThresholds: null,
  rarityConsent: false,
  keyboardShortcuts: "plain" as const,
  motion: "system" as const,
  notifications: {
    phase: true,
    treatment: false,
    measurement: true,
    watering: true,
    swap: true,
    friends: true,
    equipment: true,
  },
};

afterEach(() => setProfileTimeZone(null));

describe("US-ACC-02 profile API client", () => {
  it("loads the profile with the token as bearer", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(PROFILE)));
    const r = await loadProfile("http://api", "tok", f);
    expect(r).toEqual({ ok: true, value: PROFILE });
    expect(f).toHaveBeenCalledWith("http://api/account/profile", {
      method: "GET",
      headers: { Authorization: "Bearer tok" },
    });
  });

  it("saves the whole profile with PUT and the key of its action", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(JSON.stringify(PROFILE)));
    await saveProfile("http://api", "tok", PROFILE, { fetchFn: f, key: "test-key" });
    await saveProfile("http://api", "tok", PROFILE, { fetchFn: f, key: "test-key" });
    const keys = f.mock.calls.map(
      ([, init]) => (init?.headers as Record<string, string>)["Idempotency-Key"],
    );
    expect(keys).toEqual(["test-key", "test-key"]);
    expect(f.mock.calls[0]?.[1]).toMatchObject({ method: "PUT", body: JSON.stringify(PROFILE) });
  });

  it("returns the error with its stable code and German text on refusal", async () => {
    const error = {
      code: "input.invalid",
      text: "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.",
    };
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ error }), { status: 400 }));
    expect(
      await saveProfile("http://api", "tok", PROFILE, { fetchFn: f, key: "test-key" }),
    ).toEqual({ ok: false, error });
  });
});

describe("US-ACC-02 time zone of all dates (NFR-08)", () => {
  it("is the device's when no profile time zone is set", () => {
    expect(currentTimeZone()).toBe(deviceTimeZone());
  });

  it("is the profile's once chosen, and the device's again when cleared", () => {
    setProfileTimeZone("Pacific/Auckland");
    expect(currentTimeZone()).toBe("Pacific/Auckland");
    setProfileTimeZone(null);
    expect(currentTimeZone()).toBe(deviceTimeZone());
  });
});
