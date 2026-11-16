// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { LayerRow, LayerTile } from "./friend-tiles";

afterEach(cleanup);

function show(count: number | "loading") {
  return render(
    <MemoryRouter>
      <LayerTile id="requests" name="Anfragen" count={count} />
    </MemoryRouter>,
  );
}

describe("US-QS-20 the tiles of Freunde at zero (issue 1045)", () => {
  it("US-QS-20 a tile at zero reads as none, not as a number of work", () => {
    show(0);
    const tile = screen.getByRole("button", { name: /Anfragen/ });
    expect(tile.textContent).toBe("Anfragenkeine");
  });

  it("US-QS-20 · P-10 a count above zero still shows the number", () => {
    show(2);
    expect(screen.getByRole("button", { name: /Anfragen/ }).textContent).toBe("Anfragen2");
  });
});

describe("US-QS-32 the tiles of Freunde are neutral (SG-COLOR-02, SG-LIST-05)", () => {
  it("US-QS-32 a count tile is on the card colour with foreground text and no green outline", () => {
    show(2);
    const cls = screen.getByRole("button", { name: /Anfragen/ }).className;
    expect(cls).toContain("bg-card");
    expect(cls).toContain("border-transparent");
    expect(cls).not.toMatch(/border-primary|text-primary/);
  });

  it("US-QS-32 a row that opens its layer is neutral too, with its state in foreground text", () => {
    render(
      <MemoryRouter>
        <LayerRow id="friends" name="Meine Freunde" state="3 Freunde" />
      </MemoryRouter>,
    );
    const cls = screen.getByRole("button", { name: /Meine Freunde/ }).className;
    expect(cls).toContain("bg-card");
    expect(cls).not.toMatch(/border-primary|text-primary/);
  });
});
