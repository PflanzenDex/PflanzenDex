// @vitest-environment jsdom
import { composeStories } from "@storybook/react-vite";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { prepareStories } from "../../harness/story-test-helpers";
import { unmountStoryRuns } from "../../../../shared/testing/story-teardown/story-teardown";
import * as stories from "./sammlung.stories";

prepareStories();
const { PlantsPhone, SpeciesDesktopDark, WishlistPhone, PlantsEmpty } = composeStories(stories);

describe("US-QS-14 · page story Sammlung", () => {
  afterEach(unmountStoryRuns);

  it("US-QS-19 · the plants mode shows the tiles with their data and no loading state", async () => {
    await PlantsPhone.run();
    expect(
      (
        await screen.findAllByRole("button", {
          name: / (Gesund|Vergeilt\/dünn|Behandeln|unbekannt)$/,
        })
      ).length,
    ).toBe(3);
    expect(screen.getAllByText("Aloe").length).toBeGreaterThan(0);
    expect(screen.queryByText(/wird geladen|Lädt/)).toBeNull();
  });

  it("US-QS-14 · the species mode shows the caught species of the Pokédex", async () => {
    await SpeciesDesktopDark.run();
    expect(await screen.findByText("Dracaena trifasciata")).toBeTruthy();
    // The count comes from its own request, which can arrive after the species list (issue 1697).
    expect(await screen.findByText("3 gefangen")).toBeTruthy();
    expect(screen.getByRole("button", { name: /· 3 gefangen/ })).toBeTruthy();
  });

  it("US-QS-14 · the wishlist mode shows the open wishes in order", async () => {
    await WishlistPhone.run();
    expect(await screen.findByText(/Zebra-Haworthie \(Haworthia fasciata\)/)).toBeTruthy();
    expect(screen.getByText(/^2\. /)).toBeTruthy();
  });

  it("US-QS-14 · a new account sees no plant cards", async () => {
    await PlantsEmpty.run();
    expect(await screen.findByRole("button", { name: "Pflanzen" })).toBeTruthy();
    expect(screen.queryByText("Aloe")).toBeNull();
  });

  it("US-QS-26 · a tile of the plants opens its plant as a layer with the plant's data, the way the install sheet's screenshot opens it", async () => {
    await PlantsPhone.run();
    await userEvent.click(await screen.findByRole("button", { name: /^Aloe\b/ }));
    expect(await screen.findByRole("dialog", { name: "Aloe" })).toBeTruthy();
    expect(await screen.findByText(/Letzte Messung: 24 cm/)).toBeTruthy();
    expect(screen.queryByText(/Nicht vorhanden/)).toBeNull();
  });
});
