import { describe, expect, it } from "vitest";
import { badgeTarget, badgeTotal } from "./badge-target";

describe("US-QS-29 the total of Heute", () => {
  it("US-QS-29 sums the three categories of Heute: watering, open treatments and hints", () => {
    // The open treatments already contain the overdue ones, so they are counted once.
    expect(badgeTotal({ watering: 2, treatments: 3, hints: 1 })).toBe(6);
  });

  it("US-QS-29 has no total while one category is still loading or failed", () => {
    expect(badgeTotal({ watering: 2, treatments: undefined, hints: 1 })).toBeUndefined();
    expect(badgeTotal({ watering: undefined, treatments: 3, hints: 1 })).toBeUndefined();
  });
});

describe("US-QS-29 what the icon shows", () => {
  const open = { calmMode: false, remindersOn: true } as const;

  it("US-QS-29 shows the total with calm mode off and reminders on", () => {
    expect(badgeTarget({ ...open, total: 6 })).toBe(6);
  });

  it("US-QS-29 clears the icon at a total of 0", () => {
    expect(badgeTarget({ ...open, total: 0 })).toBe("clear");
  });

  it("US-QS-29 clears the icon in calm mode (US-ACH-08)", () => {
    expect(badgeTarget({ calmMode: true, remindersOn: true, total: 6 })).toBe("clear");
  });

  it("US-QS-29 clears the icon when every reminder switch is off (P-12)", () => {
    expect(badgeTarget({ calmMode: false, remindersOn: false, total: 6 })).toBe("clear");
  });

  it("US-QS-29 clears in calm mode even while a count is still unknown", () => {
    expect(badgeTarget({ calmMode: true, remindersOn: true, total: undefined })).toBe("clear");
  });

  it("US-QS-29 clears when every reminder switch is off even while a count is unknown", () => {
    expect(badgeTarget({ calmMode: false, remindersOn: false, total: undefined })).toBe("clear");
  });

  it("US-QS-29 waits, sets no number, while calm mode is unknown", () => {
    expect(badgeTarget({ calmMode: undefined, remindersOn: true, total: 6 })).toBe("wait");
  });

  it("US-QS-29 waits, sets no number, while the reminder settings are unknown", () => {
    expect(badgeTarget({ calmMode: false, remindersOn: undefined, total: 6 })).toBe("wait");
  });

  it("US-QS-29 waits, sets no number, while a count is unknown (P-08)", () => {
    expect(badgeTarget({ ...open, total: undefined })).toBe("wait");
  });
});
