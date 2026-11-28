// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, describe, expect, it } from "vitest";
import preview from "../../../.storybook/preview";
import { unmountStoryRuns } from "../testing/story-teardown/story-teardown";
import * as checkbox from "./checkbox.stories";
import * as input from "./input.stories";
import * as select from "./select.stories";
import * as stepper from "./stepper.stories";
import * as switchStories from "./switch.stories";
import * as textarea from "./textarea.stories";

setProjectAnnotations([preview]);

const catalog = {
  Input: composeStories(input),
  Textarea: composeStories(textarea),
  Select: composeStories(select),
  Checkbox: composeStories(checkbox),
  Switch: composeStories(switchStories),
  Stepper: composeStories(stepper),
};

describe("TE-18 · DS-01 ui form primitive stories", () => {
  afterEach(unmountStoryRuns);

  for (const [component, stories] of Object.entries(catalog))
    for (const [name, Story] of Object.entries(stories))
      for (const scheme of ["light", "dark"] as const)
        it(`TE-18 · ${component}/${name} renders in ${scheme} mode`, async () => {
          await Story.run({ globals: { colorScheme: scheme } });
          expect(document.body.children.length).toBeGreaterThan(0);
        });
});
