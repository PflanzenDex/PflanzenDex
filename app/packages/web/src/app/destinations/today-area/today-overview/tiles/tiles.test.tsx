// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { Tiles, type CategoryCount } from "./tiles";

const ready = (count: number): CategoryCount => ({ status: "ready", count });

function renderTiles(treatments: CategoryCount) {
  render(
    <MemoryRouter>
      <Tiles treatmentFirst={false} treatments={treatments} watering={ready(0)} hints={ready(1)} />
    </MemoryRouter>,
  );
  return within(screen.getByRole("list", { name: "Themen" }));
}

afterEach(() => {
  cleanup();
});

describe("US-QS-32 category tiles of Heute: the count agrees with the label", () => {
  it("US-QS-32 one open treatment reads 'Behandlung', and the accessible name has a space after the number", () => {
    const tiles = renderTiles(ready(1));
    expect(tiles.getByRole("button", { name: "1 Behandlung" }).textContent).toBe("1 Behandlung");
  });

  it("US-QS-32 zero and several open treatments read 'Behandlungen'", () => {
    expect(renderTiles(ready(0)).getByRole("button", { name: "0 Behandlungen" })).toBeTruthy();
    cleanup();
    expect(renderTiles(ready(2)).getByRole("button", { name: "2 Behandlungen" })).toBeTruthy();
  });

  it("US-QS-32 a count that is still loading reads as the plural, not as 'Behandlung'", () => {
    const tiles = renderTiles({ status: "pending", count: undefined });
    expect(tiles.getByRole("button", { name: /Behandlungen$/ })).toBeTruthy();
  });

  it("US-QS-32 a failed load never reads 'Behandlung' beside 'nicht geladen', even with a stored count of one", () => {
    const tiles = renderTiles({ status: "error", count: 1 });
    expect(tiles.getByRole("button", { name: "nicht geladen Behandlungen" })).toBeTruthy();
    expect(tiles.queryByRole("button", { name: /Behandlung$/ })).toBeNull();
  });

  it("US-QS-32 Gießen and Fehlt noch need no plural: the label stays as it is at any count", () => {
    const tiles = renderTiles(ready(1));
    expect(tiles.getByRole("button", { name: "0 Gießen" })).toBeTruthy();
    expect(tiles.getByRole("button", { name: "1 Fehlt noch" })).toBeTruthy();
  });
});

describe("US-QS-32 the category tiles are neutral (SG-COLOR-02, SG-LIST-05)", () => {
  it("US-QS-32 a tile is on the card colour with foreground text and no green outline", () => {
    const tiles = renderTiles(ready(2));
    const cls = tiles.getByRole("button", { name: "2 Behandlungen" }).className;
    expect(cls).toContain("bg-card");
    expect(cls).toContain("border-transparent");
    expect(cls).toContain("text-foreground");
    expect(cls).not.toContain("text-primary");
    expect(cls).not.toMatch(/border-primary/);
  });

  it("US-QS-32 a count of zero is regular and muted, not styled as a number to tap", () => {
    const tiles = renderTiles(ready(1));
    const zero = tiles.getByRole("button", { name: /Wassergaben|Gießen/ });
    expect(zero.querySelector("span")?.className).toContain("text-muted-foreground");
    expect(zero.querySelector("span")?.className).not.toContain("font-semibold");
  });
});
