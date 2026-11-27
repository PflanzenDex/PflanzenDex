// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, describe, expect, it } from "vitest";
import preview from "../../../../../.storybook/preview";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { unmountStoryRuns } from "../../../../shared/testing/story-teardown/story-teardown";
import * as indexedList from "../../../../shared/lists/indexed-list/indexed-list.stories";
import * as groupedSections from "../../../../shared/lists/grouped-list/grouped-sections/grouped-sections.stories";
import * as groupedScrolling from "../../../../shared/lists/grouped-list/grouped-sections/grouped-sections.scrolling.stories";
import * as banner from "../../../../shared/patterns/states/banner/banner.stories";
import * as emptyState from "../../../../shared/patterns/elements/empty-state/empty-state.stories";
import * as pageSkeleton from "../../../../shared/patterns/states/page-skeleton/page-skeleton.stories";
import * as plantLoader from "../../../../shared/patterns/states/plant-loader/plant-loader.stories";
import * as requestState from "../../../../shared/patterns/states/request-state/request-state.stories";
import * as layerSheet from "../../../../shared/patterns/responsive/layer-sheet/layer-sheet.stories";
import * as layerSheetHeights from "../../../../shared/patterns/responsive/layer-sheet/layer-sheet.heights.stories";
import * as layerSheetLists from "../../../../shared/patterns/responsive/layer-sheet/layer-sheet.lists.stories";
import * as layerSheetStates from "../../../../shared/patterns/responsive/layer-sheet/layer-sheet.states.stories";
import * as scrollEntries from "../../../../shared/patterns/responsive/entry-list/paging/scroll-entries/scroll-entries.stories";
import * as responsiveModal from "../../../../shared/patterns/responsive/responsive-modal/responsive-modal.stories";
import * as responsiveTable from "../../../../shared/patterns/responsive/responsive-table/responsive-table.stories";
import * as toast from "../../../../shared/patterns/states/toast/toast.stories";

setProjectAnnotations([preview]);

const catalog = {
  Banner: composeStories(banner),
  EmptyState: composeStories(emptyState),
  GroupedSections: composeStories(groupedSections),
  GroupedSectionsScrolling: composeStories(groupedScrolling),
  IndexedList: composeStories(indexedList),
  LayerSheet: composeStories(layerSheet),
  LayerSheetHeights: composeStories(layerSheetHeights),
  LayerSheetLists: composeStories(layerSheetLists),
  LayerSheetStates: composeStories(layerSheetStates),
  ScrollEntries: composeStories(scrollEntries),
  PageSkeleton: composeStories(pageSkeleton),
  PlantLoader: composeStories(plantLoader),
  RequestState: composeStories(requestState),
  ResponsiveModal: composeStories(responsiveModal),
  ResponsiveTable: composeStories(responsiveTable),
  Toast: composeStories(toast),
};

describe("TE-17 · DS-02 shared component stories", () => {
  afterEach(unmountStoryRuns);

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
