import { afterEach, describe, expect, it, vi } from "vitest";
import { setProfileTimeZone } from "../kernel";
import { loadOpenTreatments } from "./api/treatments-api";

afterEach(() => setProfileTimeZone(null));

describe("US-ACC-02 time zone of due dates (NFR-08)", () => {
  it("due dates of treatments are requested in the profile's time zone", async () => {
    setProfileTimeZone("Pacific/Auckland");
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ treatments: [] })));
    await loadOpenTreatments("http://api", "tok", f);
    expect(String(f.mock.calls[0]?.[0])).toContain("timeZone=Pacific%2FAuckland");
  });
});
