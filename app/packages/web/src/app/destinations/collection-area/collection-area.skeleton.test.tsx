// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { expectOneLoadingStatus } from "@/shared/ui/display/skeleton/loading-contract";
import type { SammlungShape } from "../../sammlung-view";
import { CollectionModeSkeleton, CollectionRouteSkeleton } from "./collection-area.skeleton";

afterEach(cleanup);

const shape = (over: Partial<SammlungShape> = {}): SammlungShape => ({
  view: "plants",
  sort: "pokedex",
  group: "all",
  managing: false,
  ...over,
});

/** Each mode of the address with the label of the mode's own loading state (US-QS-14, issue 1727). */
const MODES: [string, SammlungShape, string][] = [
  ["the plants", shape(), "Sammlung wird geladen …"],
  ["the plants grouped by care phase", shape({ group: "phase" }), "Pflegephasen werden geladen …"],
  ["the species (Pokédex)", shape({ view: "species" }), "Pokédex wird geladen …"],
  [
    "the species compared by difficulty",
    shape({ view: "species", sort: "difficulty" }),
    "Artenvergleich wird geladen …",
  ],
  ["the wishlist", shape({ view: "wishlist" }), "Wunschliste wird geladen …"],
  ["the equipment", shape({ view: "equipment" }), "Equipment wird geladen …"],
  ["the locations", shape({ managing: true }), "Standorte und Lichtzonen werden geladen …"],
];

describe("CollectionRouteSkeleton (US-QS-14, DS-52, DS-57, issue 1727)", () => {
  it("US-QS-14 issue 1727 · the title 'Sammlung' stands at once as the one h1, the blocks wait for the delay", async () => {
    render(<CollectionRouteSkeleton shape={shape()} />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Sammlung");
    expect(headings[0]?.hasAttribute("data-route-fallback")).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it.each(MODES)(
    "US-QS-14 issue 1727 · the route skeleton has the shape of %s, the address names it",
    async (_name, mode, label) => {
      await expectOneLoadingStatus(<CollectionRouteSkeleton shape={mode} />, label);
    },
  );

  it("US-QS-14 issue 1727 · a fast load draws no block: the header keeps its height, the blocks wait for the delay (DS-52, DS-57)", async () => {
    const { container } = render(<CollectionRouteSkeleton shape={shape({ view: "species" })} />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    expect(container.querySelector(".h-11.w-24")).not.toBeNull();
    expect(container.querySelector(".h-\\[52px\\]")).not.toBeNull();
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("US-QS-14 issue 1727 · no number is shown while the Sammlung loads (P-08)", async () => {
    render(<CollectionRouteSkeleton shape={shape({ view: "wishlist" })} />);
    expect((await screen.findByRole("status")).textContent).not.toMatch(/\d/);
  });
});

describe("CollectionModeSkeleton (US-QS-14, DS-57, issue 1727)", () => {
  it("US-QS-14 issue 1727 · the mode's body shows after the delay and never twice", async () => {
    render(<CollectionModeSkeleton shape={shape({ view: "equipment" })} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("Equipment wird geladen");
  });
});
