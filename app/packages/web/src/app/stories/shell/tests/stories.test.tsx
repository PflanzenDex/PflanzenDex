// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import preview from "../../../../../.storybook/preview";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import * as banner from "../../../../shared/patterns/states/banner/banner.stories";
import * as emptyState from "../../../../shared/patterns/elements/empty-state/empty-state.stories";
import * as pageSkeleton from "../../../../shared/patterns/states/page-skeleton/page-skeleton.stories";
import * as plantLoader from "../../../../shared/patterns/states/plant-loader/plant-loader.stories";
import * as requestState from "../../../../shared/patterns/states/request-state/request-state.stories";
import * as layerSheet from "../../../../shared/patterns/responsive/layer-sheet/layer-sheet.stories";
import * as pager from "../../../../shared/patterns/responsive/pager/pager.stories";
import * as responsiveModal from "../../../../shared/patterns/responsive/responsive-modal/responsive-modal.stories";
import * as responsiveTable from "../../../../shared/patterns/responsive/responsive-table/responsive-table.stories";
import * as toast from "../../../../shared/patterns/states/toast/toast.stories";

setProjectAnnotations([preview]);

const catalog = {
  Banner: composeStories(banner),
  EmptyState: composeStories(emptyState),
  LayerSheet: composeStories(layerSheet),
  Pager: composeStories(pager),
  PageSkeleton: composeStories(pageSkeleton),
  PlantLoader: composeStories(plantLoader),
  RequestState: composeStories(requestState),
  ResponsiveModal: composeStories(responsiveModal),
  ResponsiveTable: composeStories(responsiveTable),
  Toast: composeStories(toast),
};

describe("TE-17 · DS-02 shared component stories", () => {
  afterEach(cleanup);

  for (const [component, stories] of Object.entries(catalog))
    for (const [name, Story] of Object.entries(stories))
      for (const width of [360, 768])
        for (const scheme of ["light", "dark"] as const)
          it(`TE-17 · ${component}/${name} renders at ${width}px in ${scheme} mode`, async () => {
            setViewportWidth(width);
            await Story.run({ globals: { colorScheme: scheme } });
            expect(document.body.children.length).toBeGreaterThan(0);
          });
});
