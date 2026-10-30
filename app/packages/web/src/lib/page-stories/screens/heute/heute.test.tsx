// @vitest-environment jsdom
import { composeStories } from "@storybook/react-vite";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { prepareStories } from "../../harness/story-test-helpers";
import * as stories from "./heute.stories";

prepareStories();
const { Phone, NothingDue } = composeStories(stories);

describe("US-QS-14 · page story Heute", () => {
  afterEach(cleanup);

  it("US-QS-18 · US-QS-14 the story shows the most urgent item, the summary and the tiles of the categories", async () => {
    await Phone.run();
    expect(await screen.findByText("3 Dinge stehen an.")).toBeTruthy();
    expect((await screen.findAllByText(/Läuse/)).length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: /^Fehlt noch/ })).toBeTruthy();
    expect(screen.queryByText(/wird geladen/)).toBeNull();
  });

  it("US-QS-14 · the empty story says that nothing is due and offers the collection", async () => {
    await NothingDue.run();
    expect(await screen.findByText("Heute steht nichts an.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Zur Sammlung" }).length).toBeGreaterThan(0);
  });
});
