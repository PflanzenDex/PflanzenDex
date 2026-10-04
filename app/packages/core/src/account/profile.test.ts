import { describe, it, expect } from "vitest";
import { validateProfileInput } from "./profile";

describe("US-ACC-02 · Profile validation", () => {
  describe("Display name validation", () => {
    it("accepts a valid display name", () => {
      const result = validateProfileInput({ displayName: "Alice" });
      expect(result.ok).toBe(true);
    });

    it("accepts null display name", () => {
      const result = validateProfileInput({ displayName: null });
      expect(result.ok).toBe(true);
    });

    it("rejects empty display name", () => {
      const result = validateProfileInput({ displayName: "" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("input.invalid");
    });

    it("rejects display name longer than 255 chars", () => {
      const result = validateProfileInput({ displayName: "a".repeat(256) });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("input.invalid");
    });
  });

  describe("Time zone validation", () => {
    it("accepts valid IANA time zones", () => {
      const zones = ["Europe/Berlin", "America/New_York", "Asia/Tokyo", "UTC"];
      zones.forEach((tz) => {
        const result = validateProfileInput({ timeZone: tz });
        expect(result.ok).toBe(true);
      });
    });

    it("accepts null time zone", () => {
      const result = validateProfileInput({ timeZone: null });
      expect(result.ok).toBe(true);
    });

    it("rejects invalid time zone format", () => {
      const result = validateProfileInput({ timeZone: "Invalid/Zone" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("input.invalid");
    });

    it("rejects time zone with offset like +02:00", () => {
      const result = validateProfileInput({ timeZone: "+02:00" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("input.invalid");
    });
  });

  describe("Notification settings validation", () => {
    it("accepts valid notification preferences", () => {
      const result = validateProfileInput({
        notificationSettings: {
          phase: { enabled: true, time: "08:00" },
          treatment: { enabled: false },
        },
      });
      expect(result.ok).toBe(true);
    });

    it("rejects invalid time format", () => {
      const result = validateProfileInput({
        notificationSettings: {
          phase: { enabled: true, time: "8:00" }, // Missing leading zero
        },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("input.invalid");
    });

    it("accepts null notification settings", () => {
      const result = validateProfileInput({ notificationSettings: null });
      expect(result.ok).toBe(true);
    });
  });

  describe("Privacy switches", () => {
    it("accepts privacy switch settings", () => {
      const result = validateProfileInput({
        everythingPrivate: true,
        noRecommendations: false,
      });
      expect(result.ok).toBe(true);
    });

    it("defaults are acceptable", () => {
      const result = validateProfileInput({
        everythingPrivate: false,
        noRecommendations: false,
      });
      expect(result.ok).toBe(true);
    });
  });
});
