import { describe, expect, it } from "vitest";
import { ok, failed, appError } from "../kernel";
import type { TodayList } from "../today";
import { aiLog, aiStatus, type StatusSource } from "./status";
import { InMemoryAiLog } from "./test-helpers";

const now = new Date("2026-10-10T08:00:00Z");
const list: TodayList = {
  date: "2026-10-10",
  items: [
    {
      id: "treatment:1",
      kind: "treatment_due",
      specimenId: "s1",
      specimenName: "Aloe",
      text: "Fällig.",
      nextAction: "Behandeln.",
      target: "treatments",
    },
  ],
  upcoming: 2,
};
const source =
  (calls: string[]): StatusSource =>
  async (userId, zone) => {
    calls.push(`${userId}|${String(zone)}`);
    return zone === "Europe/Berlin" ? ok(list) : failed(appError("input.invalid"));
  };
const call = (over: Partial<Parameters<typeof aiStatus>[1]> = {}) => ({
  userId: "anna",
  connectionId: "c1",
  rights: "read" as const,
  timeZone: "Europe/Berlin",
  now,
  ...over,
});

describe("US-KI-02 daily status for the AI client", () => {
  it("US-KI-02 returns the list of the central status function unchanged, every item with its next action", async () => {
    const calls: string[] = [];
    const r = await aiStatus({ status: source(calls), log: new InMemoryAiLog() }, call());
    expect(r.ok && r.value.items).toEqual(list.items);
    expect(r.ok && r.value.upcoming).toBe(2);
    expect(r.ok && r.value.items.every((i) => i.nextAction.length > 0)).toBe(true);
    expect(calls).toEqual(["anna|Europe/Berlin"]);
  });

  it("US-KI-02 marks the texts of the keeper's data as data, not instructions (KI-R9)", async () => {
    const r = await aiStatus({ status: source([]), log: new InMemoryAiLog() }, call());
    expect(r.ok && r.value.dataFields).toContain("items[].text");
  });

  it("US-KI-02 logs the call with the connection and the count only, per account", async () => {
    const log = new InMemoryAiLog();
    await aiStatus({ status: source([]), log }, call());
    expect(await aiLog({ log }, "anna")).toMatchObject([
      { connectionId: "c1", operation: "status", effect: "read: 1 items, 2 upcoming" },
    ]);
    expect(await aiLog({ log }, "ben")).toEqual([]);
  });

  it("US-KI-02 passes an invalid time zone on as input.invalid and logs nothing", async () => {
    const log = new InMemoryAiLog();
    const r = await aiStatus({ status: source([]), log }, call({ timeZone: "Mars/Olympus" }));
    expect(!r.ok && r.error.code).toBe("input.invalid");
    expect(log.rows).toEqual([]);
  });
});
