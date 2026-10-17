// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { UnfitWish } from "@pflanzendex/core";
import { UnfitWishes } from "./unfit-wishes";

afterEach(cleanup);
const wish = (extra: Partial<UnfitWish> = {}): UnfitWish => ({
  id: "w1",
  title: "Aloe (Aloe vera)",
  kind: "zone_outside",
  zone: "Anzucht",
  reason: "„Anzucht“ ist das Stecklingslicht, kein Ziel für erwachsene Pflanzen.",
  nextAction: "Zone prüfen: Lege den Wunsch neu an oder verwirf ihn.",
  ...extra,
});

describe("FR-WUN-03 hints for wishes without a fitting zone", () => {
  it("lists each wish with its name, zone, reason and the next action", () => {
    render(<UnfitWishes wishes={[wish()]} />);
    const section = screen.getByRole("region", { name: "Wünsche ohne passende Zone" });
    const item = within(section).getByRole("listitem");
    expect(item.textContent).toContain("Aloe (Aloe vera)");
    expect(item.textContent).toContain("Zone: Anzucht");
    expect(item.textContent).toContain("Stecklingslicht");
    expect(item.textContent).toContain("Zone prüfen");
  });

  it("a wish without a zone says unknown instead of a zone name (P-08)", () => {
    render(<UnfitWishes wishes={[wish({ kind: "zone_unknown", zone: null })]} />);
    expect(screen.getByText("Zone: unbekannt")).toBeTruthy();
  });

  it("without such wishes there is no section at all", () => {
    const { container } = render(<UnfitWishes wishes={[]} />);
    expect(container.textContent).toBe("");
  });

  it("the hint is text and a heading, not colour alone, and nothing is removed by it (P-10)", () => {
    render(<UnfitWishes wishes={[wish()]} />);
    expect(screen.getByRole("heading", { name: "Wünsche ohne passende Zone" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
