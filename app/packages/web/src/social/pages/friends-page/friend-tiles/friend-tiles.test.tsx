// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SKELETON_DELAY_MS } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
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

describe("US-QS-32 · issue 2355 a full-width row that opens a layer shows the chevron, a tile does not (SG-TOUCH-02)", () => {
  it("US-QS-32 · issue 2355 the row shows the neutral chevron, decorative, after its state at the trailing edge", () => {
    render(
      <MemoryRouter>
        <LayerRow id="friends" name="Meine Freunde" state="3 Freunde" />
      </MemoryRouter>,
    );
    const row = screen.getByRole("button", { name: /Meine Freunde/ });
    const icon = row.querySelector("svg.lucide-chevron-right");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.getAttribute("class")).toContain("size-4");
    expect(icon?.getAttribute("class")).toContain("text-muted-foreground");
    expect(row.lastElementChild).toBe(icon);
    // The name and the state stay the row's accessible name: the icon adds no text.
    expect(row.textContent).toBe("Meine Freunde3 Freunde");
  });

  it("US-QS-32 · issue 2355 the name and the state wrap in a block of their own, so the chevron keeps its place at a large text size", () => {
    render(
      <MemoryRouter>
        <LayerRow id="friends" name="Meine Freunde" state="3 Freunde" />
      </MemoryRouter>,
    );
    const row = screen.getByRole("button", { name: /Meine Freunde/ });
    const text = screen.getByText("Meine Freunde").parentElement as HTMLElement;
    expect(text.parentElement).toBe(row);
    expect(text.className).toContain("flex-wrap");
    expect(text.className).toContain("min-w-0");
    expect(text.className).toContain("flex-1");
    // A long word breaks instead of running under the chevron (measured at 180 px width and 200 % text).
    expect(screen.getByText("Meine Freunde").className).toContain("[overflow-wrap:anywhere]");
    expect(screen.getByText("3 Freunde").className).toContain("[overflow-wrap:anywhere]");
  });

  it("US-QS-32 · issue 2355 a tile is a tile, not a row: it shows no chevron", () => {
    show(2);
    expect(
      screen.getByRole("button", { name: /Anfragen/ }).querySelector("svg.lucide-chevron-right"),
    ).toBeNull();
  });
});

describe("US-QS-32 a tile keeps its size while its count loads (SG-STATE-02, F-0247, issue 1995)", () => {
  it("US-QS-32 · SG-STATE-02 a loading count is a bar of the count line's height from the first frame", () => {
    vi.useFakeTimers();
    try {
      show("loading");
      const tile = screen.getByRole("button", { name: /Anfragen/ });
      const reserve = tile.querySelector("[data-count-skeleton]");
      expect(reserve?.className).toContain("h-5");
      // The box stands at once; its bar and loading text come after the delay (DS-57).
      expect(tile.textContent).toBe("Anfragen");
      act(() => {
        vi.advanceTimersByTime(SKELETON_DELAY_MS);
      });
      expect(tile.textContent).toBe("Anfragenlädt …");
    } finally {
      vi.useRealTimers();
    }
  });
});
