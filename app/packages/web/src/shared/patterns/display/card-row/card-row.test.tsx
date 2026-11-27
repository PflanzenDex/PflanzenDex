// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CardRow } from "./card-row";

afterEach(cleanup);

const row = (n = 3) =>
  render(
    <CardRow label="Sammlerkarten">
      {Array.from({ length: n }, (_, i) => (
        <article key={i} aria-label={`Karte ${i + 1}`}>
          <button>Mehr {i + 1}</button>
        </article>
      ))}
    </CardRow>,
  );

describe("US-QS-15 · US-QS-32 the card row is a sideways shelf of cards (DS-61, DS-63)", () => {
  it("US-QS-15 the shelf is the marked sideways region 'cards' of the one-screen gate", () => {
    row();
    const region = screen.getByRole("region", { name: "Sammlerkarten" });
    expect(region.getAttribute("data-scroll-x")).toBe("cards");
    expect(region.className).toContain("overflow-x-auto");
    // A region that scrolls keeps its scroll inside itself (DS-61).
    expect(region.className).toContain("overscroll-contain");
  });

  it("US-QS-15 · WCAG 2.1.1 the region is a tab stop, so the keyboard can scroll it with the arrow keys", () => {
    row();
    expect(screen.getByRole("region", { name: "Sammlerkarten" }).getAttribute("tabindex")).toBe(
      "0",
    );
  });

  it("US-QS-15 each card stands in its own list item of one list, so a screen reader counts the cards", () => {
    row(4);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[1]?.querySelector("article")?.getAttribute("aria-label")).toBe("Karte 2");
  });

  it("US-QS-15 the cards snap to the start of the shelf, one at a time (scroll-snap)", () => {
    row();
    const region = screen.getByRole("region", { name: "Sammlerkarten" });
    expect(region.className).toContain("snap-x");
    expect(region.className).toContain("snap-mandatory");
    for (const item of screen.getAllByRole("listitem"))
      expect(item.className).toContain("snap-start");
  });

  it("US-QS-15 a card is narrower than the shelf by the peek, so the next card shows at the edge (starting value, assumption)", () => {
    row();
    for (const item of screen.getAllByRole("listitem")) {
      expect(item.className).toContain("w-[min(calc(100%-3rem),24rem)]");
      expect(item.className).toContain("shrink-0");
    }
  });

  it("US-QS-15 the row does not wrap: the cards sit in one line", () => {
    row();
    expect(screen.getByRole("list").className).toContain("flex");
    expect(screen.getByRole("list").className).not.toContain("flex-wrap");
  });
});
