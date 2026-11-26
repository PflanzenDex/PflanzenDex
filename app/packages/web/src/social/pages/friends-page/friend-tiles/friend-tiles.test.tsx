// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SKELETON_DELAY_MS } from "@/shared/ui/skeleton.delayed";
import { hasOwnBorder, isNeutral } from "@/shared/ui/button.roles";
import {
  LayerCountRow,
  LayerRow,
  LinkTile,
  countMeta,
  newsMeta,
  requestsMeta,
  type TileCount,
} from "./friend-tiles";

afterEach(cleanup);

/** The counted row of the requests, as the page draws it (issue 2419). */
function show(count: TileCount) {
  return render(
    <MemoryRouter>
      <ul>
        <LayerCountRow id="requests" name="Anfragen" meta={countMeta(count, requestsMeta)} />
      </ul>
    </MemoryRouter>,
  );
}

/** The text of a row as it reads: the no-break space of a count is a plain space. */
const read = (el: HTMLElement) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

describe("US-QS-20 the counted rows of Freunde say what the count counts (issue 2419, SG-LIST-05)", () => {
  it("US-QS-20 a row at zero reads as a quiet line, not as a number of work", () => {
    show(0);
    expect(read(screen.getByRole("button", { name: /Anfragen/ }))).toBe(
      "Anfragen Nichts zu beantworten",
    );
  });

  it("US-QS-20 · P-10 a count above zero names its thing, in the singular for one", () => {
    show(2);
    expect(read(screen.getByRole("button", { name: /Anfragen/ }))).toBe(
      "Anfragen 2 warten auf deine Antwort",
    );
    cleanup();
    show(1);
    expect(read(screen.getByRole("button", { name: /Anfragen/ }))).toBe(
      "Anfragen 1 wartet auf deine Antwort",
    );
  });

  it("US-QS-20 the lines of the news: none, one plant, several plants; the number stays with its word", () => {
    expect(newsMeta(0)).toBe("Nichts Neues");
    expect(newsMeta(1)).toBe("1\u00a0neue Pflanze");
    expect(newsMeta(3)).toBe("3\u00a0neue Pflanzen");
    expect(requestsMeta(2)).toBe("2\u00a0warten auf deine Antwort");
  });

  it("US-QS-20 · P-10 calm mode shows no line, a count that failed says so", () => {
    expect(countMeta("hidden", requestsMeta)).toBeUndefined();
    show("hidden");
    expect(read(screen.getByRole("button", { name: /Anfragen/ }))).toBe("Anfragen");
    cleanup();
    show("error");
    expect(read(screen.getByRole("button", { name: /Anfragen/ }))).toBe("Anfragen nicht geladen");
  });
});

describe("US-QS-32 the tiles of Freunde are neutral (SG-COLOR-02, SG-LIST-05)", () => {
  it("US-QS-32 · SG-COLOR-02 a counted row is neutral: no green fill, no border of its own", () => {
    show(2);
    const row = screen.getByRole("button", { name: /Anfragen/ });
    expect(row.className).not.toMatch(/border-primary|text-primary|bg-primary/);
    expect(isNeutral(row)).toBe(true);
    expect(hasOwnBorder(row)).toBe(false);
  });

  it("US-QS-32 · SG-COLOR-02 a tile that leads to a view and the row of a layer are neutral, without a border", () => {
    render(
      <MemoryRouter>
        <LinkTile to="/swap" name="Tauschbörse" count={0} />
        <LayerRow id="friends" name="Meine Freunde" state="3 Freunde" />
      </MemoryRouter>,
    );
    for (const el of [
      screen.getByRole("link", { name: /Tauschbörse/ }),
      screen.getByRole("button", { name: /Meine Freunde/ }),
    ]) {
      expect(isNeutral(el)).toBe(true);
      expect(hasOwnBorder(el)).toBe(false);
    }
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

  it("US-QS-32 · issue 2355 a tile is a tile, not a row: it shows no chevron, a counted row does", () => {
    render(
      <MemoryRouter>
        <LinkTile to="/swap" name="Tauschbörse" count={2} />
        <ul>
          <LayerCountRow id="requests" name="Anfragen" meta={countMeta(2, requestsMeta)} />
        </ul>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: /Tauschbörse/ }).querySelector("svg.lucide-chevron-right"),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /Anfragen/ }).querySelector("svg.lucide-chevron-right"),
    ).not.toBeNull();
  });

  it("US-QS-20 a counted row opens its layer: it says so and whether the layer is open", () => {
    show(2);
    const row = screen.getByRole("button", { name: /Anfragen/ });
    expect(row.getAttribute("aria-haspopup")).toBe("dialog");
    expect(row.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("US-QS-32 a row keeps its size while its count loads (SG-STATE-02, F-0247, issue 1995)", () => {
  it("US-QS-32 · SG-STATE-02 a loading count is a bar of the count line's height from the first frame", () => {
    vi.useFakeTimers();
    try {
      show("loading");
      const tile = screen.getByRole("button", { name: /Anfragen/ });
      const reserve = tile.querySelector("[data-count-skeleton]");
      expect(reserve?.className).toContain("h-5");
      // The box stands at once; its bar and loading text come after the delay (DS-57).
      expect(read(tile)).toBe("Anfragen");
      act(() => {
        vi.advanceTimersByTime(SKELETON_DELAY_MS);
      });
      expect(read(tile)).toBe("Anfragen lädt …");
    } finally {
      vi.useRealTimers();
    }
  });
});
