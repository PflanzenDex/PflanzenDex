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

/**
 * Finds a card button such as "Archivieren: Bogenhanf": the plant is named after the colon, and its layer is opened
 * first unless a layer holds the button already (US-QS-19).
 */
export async function findCardButton(label: string): Promise<HTMLElement> {
  const name = label.slice(label.indexOf(": ") + 2);
  if (!screen.queryByRole("button", { name: label })) await openPlant(name);
  return screen.findByRole("button", { name: label });
}

/** Opens the layer with the archive (US-QS-19); it exists only while something is archived. */
export async function openArchive(): Promise<void> {
  await userEvent.click(await screen.findByRole("button", { name: /^Archiv \(\d+\)$/ }));
}
