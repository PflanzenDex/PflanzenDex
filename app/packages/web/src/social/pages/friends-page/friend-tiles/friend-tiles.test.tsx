// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { LayerTile } from "./friend-tiles";

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
