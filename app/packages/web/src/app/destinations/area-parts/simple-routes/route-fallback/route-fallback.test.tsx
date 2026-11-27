// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { VIEW_KEY } from "@/app/sammlung-view";
import { expectOneLoadingStatus } from "@/shared/ui/skeleton.loading-contract";
import {
  expectTitleInBar,
  renderInTopBar,
} from "@/shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot.test-helpers";
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
      // The way back of a sub-page is a link, which needs the router the app has (US-QS-32).
      await expectOneLoadingStatus(
        <MemoryRouter>{routeFallbackOf(path, "", state)}</MemoryRouter>,
        label,
      );
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
      const { container } = render(<MemoryRouter>{routeFallbackOf(path, "", state)}</MemoryRouter>);
      expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
      expect(await screen.findByRole("status")).toBeTruthy();
      expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    },
  );

  it.each(ROUTES.filter(([, heading]) => heading !== "none"))(
    "US-QS-32 · SG-HEAD-01 %s: the skeleton's title is in the top bar below md, as the page's will be, so it does not move when the page arrives",
    (path, heading) => {
      renderInTopBar(<>{routeFallbackOf(path, "", state)}</>, path);
      expectTitleInBar(heading);
    },
  );

  it("US-QS-32 the skeletons of the sub-pages carry the way back of their page, named after its target (SG-HEAD-04)", () => {
    renderInTopBar(<>{routeFallbackOf("/friends/exchange", "", state)}</>, "/friends/exchange");
    expectTitleInBar("Tauschbörse", "Zurück zu Freunde");
    cleanup();
    renderInTopBar(<>{routeFallbackOf("/friends/match", "", state)}</>, "/friends/match");
    expectTitleInBar("Passende Angebote", "Zurück zur Tauschbörse");
    cleanup();
    renderInTopBar(<>{routeFallbackOf("/friends/clara-1", "", state)}</>, "/friends/clara-1");
    expectTitleInBar("Sammlung eines Freundes", "Zurück zu Freunde");
  });

  it("US-QS-14 issue 1727 · a route without its own skeleton keeps the generic one of the route boundary", () => {
    expect(routeFallbackOf("/collection/labels", "", state)).toBeUndefined();
    expect(routeFallbackOf("/review", "", state)).toBeUndefined();
  });
});

describe("routeFallbackOf: 'Sammlung' follows the mode the address names (US-QS-14, issue 1727)", () => {
  it("US-QS-14 issue 1727 · the address names the mode: the species show the Pokédex's skeleton", async () => {
    await expectOneLoadingStatus(
      <>{routeFallbackOf("/collection", "?view=species", state)}</>,
      "Arten werden geladen …",
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

describe("routeFallbackOf: the root address (US-QS-16, issue 2230)", () => {
  it("US-QS-16 · issue 2230 the root address shows the skeleton of Heute, the page it redirects to", () => {
    render(<>{routeFallbackOf("/", "", state)}</>);
    const title = screen.getByRole("heading", { level: 1, name: "Heute" });
    expect(title.hasAttribute("data-route-fallback")).toBe(true);
  });

  it("US-QS-14 issue 2230 · the Betreiber address shows its title and the rows of its page while it loads", async () => {
    await expectOneLoadingStatus(
      <>{routeFallbackOf("/operator", "", state)}</>,
      "Zahlen werden geladen …",
    );
    const title = screen.getByRole("heading", { level: 1, name: "Betreiber" });
    expect(title.hasAttribute("data-route-fallback")).toBe(true);
  });
});
