// @vitest-environment jsdom
import { cleanup, render as renderPlain, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { UnfitWish } from "@pflanzendex/core";
import { UnfitWishes } from "./unfit-wishes";

afterEach(cleanup);
// The wishes are pages of a layer list, so they need the address (issue 1154).
const render = (ui: ReactElement) => renderPlain(<MemoryRouter>{ui}</MemoryRouter>);
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
    expect(section.textContent).toContain("Zone prüfen");
  });

  it("FR-WUN-03 · US-QS-15 · issue 1154 a next step shared by all wishes is said once above them, and they page by the free height", () => {
    render(<UnfitWishes wishes={[wish(), wish({ id: "w2", title: "Pilea" })]} />);
    const section = screen.getByRole("region", { name: "Wünsche ohne passende Zone" });
    expect(within(section).getAllByText(/Zone prüfen/)).toHaveLength(1);
    for (const item of within(section).getAllByRole("listitem"))
      expect(item.textContent).not.toContain("Zone prüfen");
    expect(within(section).getByRole("list").hasAttribute("data-page-fit")).toBe(true);
  });

  it("FR-WUN-03 · issue 1154 different next steps stay on their rows", () => {
    render(<UnfitWishes wishes={[wish(), wish({ id: "w2", nextAction: "Anders vorgehen." })]} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]?.textContent).toContain("Zone prüfen");
    expect(items[1]?.textContent).toContain("Anders vorgehen.");
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
