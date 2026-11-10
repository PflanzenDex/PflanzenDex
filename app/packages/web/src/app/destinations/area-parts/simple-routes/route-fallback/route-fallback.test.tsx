// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VIEW_KEY } from "@/app/sammlung-view";
import { expectOneLoadingStatus } from "@/shared/ui/display/skeleton/loading-contract";
import { routeFallbackOf, type FallbackState } from "./route-fallback";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const state: FallbackState = { suggestionsOn: true, offered: () => true };

/** Each route of the social area and the species profile, with its page's h1 ("none" when the page has none yet) and its loading label. */
const ROUTES: [string, string, string][] = [
  ["/friends", "Freunde", "Freunde werden geladen …"],
  ["/friends/exchange", "Tauschbörse", "Tauschbörse wird geladen …"],
  ["/friends/match", "Passende Angebote", "Angebote werden geladen …"],
  ["/friends/clara-1", "Sammlung eines Freundes", "Sammlung wird geladen …"],
  ["/discover/species/adiantum", "none", "Art wird geladen …"],
];

describe("routeFallbackOf: the routes of 'Freunde' and the species profile (US-QS-14, DS-52, DS-57, issue 1727)", () => {
  it.each(ROUTES)(
    "US-QS-14 issue 1727 · %s has its own skeleton: the page's h1 at once (%s), one status after the delay",
    async (path, heading, label) => {
      await expectOneLoadingStatus(<>{routeFallbackOf(path, "", state)}</>, label);
      const headings = screen.queryAllByRole("heading", { level: 1 });
      if (heading === "none") {
        expect(headings).toHaveLength(0);
        return;
      }
      expect(headings).toHaveLength(1);
      expect(headings[0]?.textContent).toBe(heading);
      expect(headings[0]?.hasAttribute("data-route-fallback")).toBe(true);
    },
  );

  it.each(ROUTES)(
    "US-QS-14 issue 1727 · %s draws no block before the delay, so a fast load shows nothing (DS-57)",
    async (path) => {
      const { container } = render(<>{routeFallbackOf(path, "", state)}</>);
      expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
      expect(await screen.findByRole("status")).toBeTruthy();
      expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    },
  );

  it("US-QS-14 issue 1727 · a route without its own skeleton keeps the generic one of the route boundary", () => {
    expect(routeFallbackOf("/collection/labels", "", state)).toBeUndefined();
    expect(routeFallbackOf("/review", "", state)).toBeUndefined();
  });
});

describe("routeFallbackOf: 'Sammlung' follows the mode the address names (US-QS-14, issue 1727)", () => {
  it("US-QS-14 issue 1727 · the address names the mode: the species show the Pokédex's skeleton", async () => {
    await expectOneLoadingStatus(
      <>{routeFallbackOf("/collection", "?view=species", state)}</>,
      "Pokédex wird geladen …",
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Sammlung");
  });

  it("US-QS-14 issue 1727 · without an address the mode remembered on this device is shown", async () => {
    localStorage.setItem(VIEW_KEY, "wishlist");
    await expectOneLoadingStatus(
      <>{routeFallbackOf("/collection", "", state)}</>,
      "Wunschliste wird geladen …",
    );
  });

  it("US-QS-14 issue 1727 · a mode the keeper switched off falls back to the plants, as the page does (US-ONB-09)", async () => {
    await expectOneLoadingStatus(
      <>
        {routeFallbackOf("/collection", "?view=equipment", {
          ...state,
          offered: (v) => v !== "equipment",
        })}
      </>,
      "Sammlung wird geladen …",
    );
  });
});
