// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CardFacts } from "./card-facts";

afterEach(cleanup);

describe("US-QS-32 · d-159 the facts of a card front: the light zone, then the difficulty", () => {
  it("US-QS-32 · d-159 shows exactly two facts, 'Lichtzone N' first and the stars with the word second", () => {
    render(<CardFacts lightZone={2} difficulty={2} />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toBe("Lichtzone 2");
    expect(items[1]?.textContent).toContain("★★☆");
    expect(items[1]?.textContent).toContain("Mittel");
  });

  it("US-QS-32 · d-159 names the three levels Leicht, Mittel and Schwierig (owner decision d-163), with one to three filled stars", () => {
    const { rerender } = render(<CardFacts lightZone={3} difficulty={1} />);
    expect(screen.getByText("★☆☆")).toBeTruthy();
    expect(screen.getByText("Leicht")).toBeTruthy();
    rerender(<CardFacts lightZone={3} difficulty={3} />);
    expect(screen.getByText("★★★")).toBeTruthy();
    expect(screen.getByText("Schwierig")).toBeTruthy();
  });

  it("US-QS-14 · US-QS-32 the stars are hidden from assistive technology and a visually hidden text reads the level", () => {
    render(<CardFacts lightZone={2} difficulty={2} />);
    expect(screen.getByText("★★☆").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("Schwierigkeit 2 von 3").className).toContain("sr-only");
    expect(document.querySelector("[aria-label]")).toBeNull();
  });

  it("US-QS-32 · P-08 an unknown value says 'unbekannt' and shows no star and no number", () => {
    render(<CardFacts lightZone={null} difficulty={null} />);
    expect(screen.getByText("Lichtzone unbekannt")).toBeTruthy();
    expect(screen.getByText("Schwierigkeit unbekannt")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[★☆]/);
  });

  it("US-QS-32 · SG-TYPE-04 a fact may wrap inside the card at large text (no nowrap, never wider than the card)", () => {
    render(<CardFacts lightZone={2} difficulty={2} />);
    for (const item of screen.getAllByRole("listitem")) {
      const chip = item.firstElementChild as HTMLElement;
      expect(chip.className).toContain("whitespace-normal");
      expect(chip.className).toContain("max-w-full");
    }
  });
});
