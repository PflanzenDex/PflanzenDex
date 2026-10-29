import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The layers are dialogs and drawers; jsdom lacks pointer capture, which they use.
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;

/** Opens the layer of a plant by choosing its tile (US-QS-19); the card with its actions is inside the layer. */
export async function openPlant(name: string): Promise<void> {
  await userEvent.click(
    await screen.findByRole("button", { name: (accessible) => accessible.startsWith(`${name}, `) }),
  );
}

/** The rarer actions sit in the menu "Mehr" of the plant layer (US-QS-23); the others are buttons of a tab. */
const MENU = new Set(["Eingetopft", "Kennzeichen ändern", "Fangdatum korrigieren", "Archivieren"]);
const MENU_ITEM: Record<string, string> = {
  Eingetopft: "Eingetopft",
  "Kennzeichen ändern": "Kennzeichen",
  "Fangdatum korrigieren": "Fangdatum",
  Archivieren: "Archivieren",
};

/** Opens a tab of the open plant layer (US-QS-23). */
export async function openTab(name: string): Promise<void> {
  await userEvent.click(await screen.findByRole("tab", { name }));
}

/**
 * Finds an action of a plant such as "Archivieren: Bogenhanf": the plant is named after the colon and its layer is
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
    const item = MENU_ITEM[action] ?? action;
    if (!screen.queryByRole("menuitem", { name: item })) {
      await userEvent.click(await screen.findByRole("button", { name: "Mehr" }));
    }
    return screen.findByRole("menuitem", { name: item });
  }
  if (action === "Lichtzone ändern") await openTab("Standort");
  return screen.findByRole("button", { name: label });
}

/** Opens the layer with the archive (US-QS-19); it exists only while something is archived. */
export async function openArchive(): Promise<void> {
  await userEvent.click(await screen.findByRole("button", { name: /^Archiv \(\d+\)$/ }));
}
