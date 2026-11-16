// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { TodayItem } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayRow } from "./today-row";

afterEach(cleanup);

const item: TodayItem = {
  id: "phase:1",
  kind: "phase_deviation",
  specimenId: "1",
  specimenName: "Monstera",
  text: "Abweichung: nicht am Zielstandort",
  nextAction: "Standort prüfen",
  target: "care_phases",
};

describe("US-QS-32 a row of Heute is flat (SG-SHAPE-05)", () => {
  it("US-QS-32 a today row sits on the card colour with no shadow in the flow of the page", () => {
    render(<TodayRow item={item} onOpen={vi.fn()} />);
    const row = screen.getByText("Abweichung").closest("div.rounded-card") as HTMLElement;
    expect(row.className).toContain("bg-card");
    expect(row.className).not.toMatch(/shadow/);
  });
});
