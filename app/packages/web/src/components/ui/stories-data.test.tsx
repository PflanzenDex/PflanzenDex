// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import preview from "../../../.storybook/preview";
import * as skeleton from "./skeleton.stories";
import * as table from "./table.stories";

setProjectAnnotations([preview]);

const catalog = {
  Skeleton: composeStories(skeleton),
  Table: composeStories(table),
};

describe("TE-18 · DS-01 ui data primitive stories", () => {
  afterEach(cleanup);

  for (const [component, stories] of Object.entries(catalog))
    for (const [name, Story] of Object.entries(stories))
      for (const scheme of ["light", "dark"] as const)
        it(`TE-18 · ${component}/${name} renders in ${scheme} mode`, async () => {
          await Story.run({ globals: { colorScheme: scheme } });
          expect(document.body.children.length).toBeGreaterThan(0);
        });
});
