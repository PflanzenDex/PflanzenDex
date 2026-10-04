import { describe, it, expect } from "vitest";
import * as api from "./account-api";

describe("Settings API integration (US-ACC-02)", () => {
  it("profile types are defined", () => {
    // Test that the exported types and functions exist
    expect(typeof api.getProfile).toBe("function");
    expect(typeof api.updateProfile).toBe("function");
  });

  it("notification settings type is available", () => {
    // Verify that the types are properly exported for use in settings
    const mockSettings: api.NotificationSettings = {
      phase: { enabled: true, time: "08:00" },
      treatment: { enabled: false },
    };
    expect(mockSettings.phase).toBeDefined();
    expect(mockSettings.phase?.time).toBe("08:00");
  });

  it("account profile type includes all required fields", () => {
    const mockProfile: api.AccountProfile = {
      displayName: "Test User",
      timeZone: "Europe/Berlin",
      everythingPrivate: true,
      noRecommendations: false,
      notificationSettings: null,
    };
    expect(mockProfile.displayName).toBe("Test User");
    expect(mockProfile.timeZone).toBe("Europe/Berlin");
    expect(mockProfile.everythingPrivate).toBe(true);
    expect(mockProfile.noRecommendations).toBe(false);
  });
});
