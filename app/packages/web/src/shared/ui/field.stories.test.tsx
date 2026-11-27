// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import preview from "../../../.storybook/preview";
import { unmountStoryRuns } from "../testing/story-teardown/story-teardown";
import * as field from "./field.stories";

setProjectAnnotations([preview]);

const stories = composeStories(field);

// The catalog of the Field marks and of the named groups (TE-18, US-QS-09): every story renders in both color schemes, and its
// play (the legend is the first child of the fieldset and says the name of the group) runs too.
describe("US-QS-09 · TE-18 ui Field and FieldSet stories", () => {
  afterEach(unmountStoryRuns);

  for (const [name, Story] of Object.entries(stories))
    for (const scheme of ["light", "dark"] as const)
      it(`US-QS-09 · TE-18 · Field/${name} renders in ${scheme} mode and its play passes`, async () => {
        await Story.run({ globals: { colorScheme: scheme } });
        expect(document.body.children.length).toBeGreaterThan(0);
      });

  it("US-QS-09 the group stories name their sets: the screen reader finds each group by its legend", async () => {
    const names = {
      CheckboxSet: "Pflanzen",
      LabelLegend: "Ruhezeit",
      RadioSet: "Wie nutzt du die App?",
      HiddenLegend: "Erinnerungen aussetzen",
    } as const;
    for (const [story, name] of Object.entries(names)) {
      await stories[story as keyof typeof names].run();
      expect(screen.getByRole("group", { name }).tagName, story).toBe("FIELDSET");
      unmountStoryRuns();
    }
  });
});
