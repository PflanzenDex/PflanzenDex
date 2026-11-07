// @vitest-environment jsdom
import { composeStories } from "@storybook/react-vite";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { prepareStories } from "../../harness/story-test-helpers";
import { unmountStoryRuns } from "../../../../shared/testing/story-teardown/story-teardown";
import * as stories from "./heute.stories";

prepareStories();
const { Phone, NothingDue, PhaseFirst } = composeStories(stories);

describe("US-QS-14 · page story Heute", () => {
  afterEach(() => unmountStoryRuns(Phone));

  it("US-QS-18 · US-QS-14 the story shows the most urgent item, the summary and the tiles of the categories", async () => {
    await Phone.run();
    expect(await screen.findByText(/^Stand: /)).toBeTruthy();
    expect(screen.queryByText("3 Dinge stehen an.")).toBeNull();
    expect((await screen.findAllByText(/Läuse/)).length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: /Fehlt noch$/ })).toBeTruthy();
    expect(screen.queryByText(/wird geladen/)).toBeNull();
  });

  it("US-QS-18 the story with a treatment first has one Behandlungen entry, no tile and further tasks inline", async () => {
    await Phone.run();
    expect(
      await screen.findByRole("button", { name: /^Behandlungen 2 · 1.überfällig$/ }),
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Behandlungen/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Zu Pflegephasen: Efeu" })).toBeTruthy();
    expect(screen.getByText("Seite 1 von 2")).toBeTruthy();
  });

  it("US-QS-18 the story with another item first shows the Behandlungen tile once", async () => {
    await PhaseFirst.run();
    expect(await screen.findByRole("button", { name: /^2Behandlungen$/ })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Behandlungen/ })).toHaveLength(1);
  });

  it("US-QS-14 · the empty story says that nothing is due and offers the collection", async () => {
    await NothingDue.run();
    expect(await screen.findByText("Heute steht nichts an.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Zur Sammlung" }).length).toBeGreaterThan(0);
  });
});
