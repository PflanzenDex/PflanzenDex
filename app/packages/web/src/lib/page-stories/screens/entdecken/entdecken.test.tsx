// @vitest-environment jsdom
import { composeStories } from "@storybook/react-vite";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { prepareStories } from "../../harness/story-test-helpers";
import * as stories from "./entdecken.stories";

prepareStories();
const { SuggestionsPhone, CatalogDesktopDark, AllDecided } = composeStories(stories);

describe("US-QS-14 · page story Entdecken", () => {
  afterEach(cleanup);

  it("US-QS-14 · the suggestions mode shows the first card of the deck", async () => {
    await SuggestionsPhone.run();
    expect(await screen.findByText("Vorschlag 1 von 2")).toBeTruthy();
    expect(screen.getByText("Warum diese Art?")).toBeTruthy();
  });

  it("US-QS-14 · the catalog mode lists the species of the search", async () => {
    await CatalogDesktopDark.run();
    expect(await screen.findByText("Ochsenzunge")).toBeTruthy();
  });

  it("US-QS-14 · a decided deck says so and offers the next step", async () => {
    await AllDecided.run();
    expect(await screen.findByText("Du hast alle Vorschläge entschieden.")).toBeTruthy();
  });
});
