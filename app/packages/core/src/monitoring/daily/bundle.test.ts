import { describe, expect, it } from "vitest";
import { defaultReminderSettings, type Occasion, type ReminderSettings } from "../types";
import { bundleOf, deliveryTime, inQuietHours, isPaused, measurementOverdue } from "./bundle";

const occasion = (id: string, kind: Occasion["occasion"] = "treatment"): Occasion => ({
  id,
  occasion: kind,
  text: id,
  nextAction: "tun",
});
const settings = (change: Partial<ReminderSettings> = {}): ReminderSettings => ({
  ...defaultReminderSettings(),
  ...change,
});

describe("US-MON-01 the one bundled message of a day", () => {
  it("US-MON-01 bundles every occasion once, in the given order", () => {
    const items = bundleOf([occasion("a"), occasion("b"), occasion("a")], settings(), "2026-10-10");
    expect(items?.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("US-MON-01 without need for action nothing is bundled and so nothing is sent", () => {
    expect(bundleOf([], settings(), "2026-10-10")).toBeNull();
  });
});

describe("US-MON-08 pause per occasion", () => {
  const paused = settings({ paused: { treatment: "2026-10-17" } });

  it("US-MON-08 leaves out a paused occasion up to and including the last day of the pause", () => {
    expect(isPaused(paused, "treatment", "2026-10-17")).toBe(true);
    expect(isPaused(paused, "treatment", "2026-10-18")).toBe(false);
    expect(isPaused(paused, "measurement", "2026-10-10")).toBe(false);
  });

  it("US-MON-08 a pause silences only its occasion; if everything is paused nothing is sent", () => {
    const mixed = [occasion("t"), occasion("m", "measurement")];
    expect(bundleOf(mixed, paused, "2026-10-10")?.map((o) => o.id)).toEqual(["m"]);
    expect(bundleOf([occasion("t")], paused, "2026-10-10")).toBeNull();
  });

  it("FR-MON-03 a pause does not change what is due, it only filters the message", () => {
    const all = [occasion("t")];
    bundleOf(all, paused, "2026-10-10");
    expect(all).toHaveLength(1);
  });
});

describe("US-MON-08 quiet hours", () => {
  const night = settings({ quietFrom: "22:00", quietTo: "07:00" });

  it("US-MON-08 a window over midnight covers evening and early morning, not the day", () => {
    expect(inQuietHours(night, "23:30")).toBe(true);
    expect(inQuietHours(night, "06:59")).toBe(true);
    expect(inQuietHours(night, "07:00")).toBe(false);
    expect(inQuietHours(night, "12:00")).toBe(false);
  });

  it("US-MON-08 without quiet hours, or with an empty window, nothing is quiet", () => {
    expect(inQuietHours(settings(), "03:00")).toBe(false);
    expect(inQuietHours(settings({ quietFrom: "08:00", quietTo: "08:00" }), "08:00")).toBe(false);
  });

  it("US-MON-01 sends at 08:00 by default, and at the end of the quiet hours when 08:00 falls into them", () => {
    expect(deliveryTime(settings())).toBe("08:00");
    expect(deliveryTime(settings({ quietFrom: "07:00", quietTo: "09:30" }))).toBe("09:30");
    expect(deliveryTime(night)).toBe("08:00");
  });
});

describe("US-MON-04 overdue measurement", () => {
  const spec = (id: string, lastMeasuredOn: string | null, since: string | null) => ({
    id,
    name: id,
    lastMeasuredOn,
    since,
  });

  it("US-MON-04 reports a specimen whose last measurement is older than the days, not one exactly on the day", () => {
    const due = measurementOverdue(
      [spec("old", "2026-09-09", null), spec("edge", "2026-09-10", null)],
      "2026-10-10",
      30,
    );
    expect(due.map((o) => o.id)).toEqual(["measurement:old"]);
    expect(due[0]?.occasion).toBe("measurement");
  });

  it("US-MON-04 a specimen never measured counts from its catch date, and says it was never measured", () => {
    const due = measurementOverdue([spec("new", null, "2026-08-01")], "2026-10-10", 30);
    expect(due[0]?.text).toContain("noch nie gemessen");
    expect(measurementOverdue([spec("fresh", null, "2026-10-01")], "2026-10-10", 30)).toEqual([]);
  });

  it("US-MON-04 without any known date nothing is reported (P-08)", () => {
    expect(measurementOverdue([spec("x", null, null)], "2026-10-10", 30)).toEqual([]);
  });

  it("US-MON-04 the number of days is adjustable", () => {
    expect(measurementOverdue([spec("a", "2026-10-01", null)], "2026-10-10", 7)).toHaveLength(1);
  });
});
