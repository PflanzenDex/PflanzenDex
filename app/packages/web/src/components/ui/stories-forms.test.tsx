// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import preview from "../../../.storybook/preview";
import * as checkbox from "./checkbox.stories";
import * as input from "./input.stories";
import * as select from "./select.stories";
import * as textarea from "./textarea.stories";

setProjectAnnotations([preview]);

const catalog = {
  Input: composeStories(input),
  Textarea: composeStories(textarea),
  Select: composeStories(select),
  Checkbox: composeStories(checkbox),
};

describe("TE-18 · DS-01 ui form primitive stories", () => {
  afterEach(cleanup);

  for (const [component, stories] of Object.entries(catalog))
    for (const [name, Story] of Object.entries(stories))
      for (const scheme of ["light", "dark"] as const)
        it(`TE-18 · ${component}/${name} renders in ${scheme} mode`, async () => {
          await Story.run({ globals: { colorScheme: scheme } });
          expect(document.body.children.length).toBeGreaterThan(0);
        });
});
