import { describe, expect, it } from "vitest";
import { taskFilterOf } from "./task-filter";

describe("US-QS-26 the address of Heute names its task filter", () => {
  it("US-QS-26 ?tasks=watering narrows the day to the watering tasks", () => {
    expect(taskFilterOf(new URLSearchParams("tasks=watering"))).toBe("watering");
    expect(taskFilterOf(new URLSearchParams("sheet=hints&tasks=watering"))).toBe("watering");
  });

  it.each([
    ["no parameter", ""],
    ["another value", "tasks=treatments"],
    ["an empty value", "tasks="],
    ["the layer parameter of the watering tasks", "sheet=watering"],
    ["a differently cased value", "tasks=Watering"],
  ])("US-QS-26 %s shows the whole day", (_label, query) => {
    expect(taskFilterOf(new URLSearchParams(query))).toBeUndefined();
  });
});
