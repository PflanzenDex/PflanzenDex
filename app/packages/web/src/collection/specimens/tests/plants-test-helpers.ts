import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SpecimenCard, SpecimenSummary } from "@pflanzendex/core";
import type { CardPages } from "../cards/use-card-pages";

// The layers are dialogs and drawers; jsdom lacks pointer capture, which they use.
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;

/** The plants as the page holds them in a test: all of them loaded, so the server total is their count (FR-BES-23). */
export function pagesOf(cards: readonly SpecimenCard[]): CardPages {
  return {
    status: "ready",
    error: undefined,
    cards,
    total: cards.length,
    hasMore: false,
    loadingMore: false,
    loadMore: () => undefined,
    retry: () => undefined,
  };
}

/** The summary of the same plants (FR-BES-23): the counts only; the tests of the groups build their own. */
export function summaryOf(cards: readonly SpecimenCard[]): SpecimenSummary {
  return {
    total: cards.length,
    unplaced: cards.filter((c) => c.location === null).length,
    groups: [],
    lastLocation: null,
    anyMeasured: false,
  };
}

/**
 * Opens the layer of a plant by choosing its row (US-QS-19). A row is named by its title (US-QS-32): the plant's own name
 * (its marker) where it has one, else its name. A full name `Species – marker` opens the row of its marker.
 */
export async function openPlant(name: string): Promise<void> {
  const title = name.includes(" – ") ? name.slice(name.indexOf(" – ") + " – ".length) : name;
  await userEvent.click(
    await screen.findByRole("button", {
      name: (accessible) => accessible === title,
    }),
  );
}

/** The rarer actions sit in the menu "Mehr" of the plant layer (US-QS-23); the others are buttons of a tab. */
const MENU = new Set([
  "Umtopfen eintragen",
  "Eintopfen eintragen",
  "Kennzeichen ändern",
  "Fangdatum ändern",
  "Pflanze archivieren",
]);

/** Opens a tab of the open plant layer (US-QS-23). */
export async function openTab(name: string): Promise<void> {
  await userEvent.click(await screen.findByRole("tab", { name }));
}

/**
 * Finds an action of a plant such as "Pflanze archivieren: Bogenhanf": the plant is named after the colon and its layer is
 * opened first. A rare action is a menu item of "Mehr" (opened here), "Lichtzone ändern" is on the tab "Standort", and
 * "Messen" is the primary action of the overview (US-QS-23).
 */
export async function findCardButton(label: string): Promise<HTMLElement> {
  const [action, name] = [
    label.slice(0, label.indexOf(": ")),
    label.slice(label.indexOf(": ") + 2),
  ];
  if (!screen.queryByRole("tab", { name: "Überblick" })) await openPlant(name);
  if (MENU.has(action)) {
    if (!screen.queryByRole("menuitem", { name: action })) {
      await userEvent.click(await screen.findByRole("button", { name: "Mehr" }));
    }
    return screen.findByRole("menuitem", { name: action });
  }
  if (action === "Lichtzone ändern") await openTab("Standort");
  return screen.findByRole("button", { name: label });
}

/** Opens the layer with the archive (US-QS-19); it exists only while something is archived. */
export async function openArchive(): Promise<void> {
  await userEvent.click(await screen.findByRole("button", { name: /^Archiv \(\d+\)$/ }));
}
