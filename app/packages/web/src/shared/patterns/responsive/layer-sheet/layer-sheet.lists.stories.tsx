import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScrollEntries } from "@/shared/patterns/responsive/pager/paging/scroll-entries/scroll-entries";
import {
  closeLayer,
  openLayer,
  sheetOf,
  visibleHeight,
  waitForHeight,
  waitForKind,
} from "@/shared/testing/story-frame/sheet-play";
import { withRouter } from "@/shared/testing/story-frame/story-frame";
import { hasLayout } from "@/shared/testing/story-frame/story-play";
import { LayerSheet } from "./layer-sheet";
import { Layer } from "./layer-sheet.heights.stories";

// The lists of a layer (US-QS-15, DS-60): never cut into pages, the content of the layer scrolls. The plays of the heights are in
// `layer-sheet.heights.stories` and `layer-sheet.states.stories`.
const meta = {
  title: "shared/LayerSheet/Lists",
  component: LayerSheet,
  decorators: [withRouter],
  // The stories render their own layer (`Layer`); the args only satisfy the component's props.
  args: { id: "details", title: "Details", children: null },
} satisfies Meta<typeof LayerSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const PLANTS = Array.from({ length: 14 }, (_, index) => `Monstera ${index + 1}`);

// A list in a layer is never cut into pages (US-QS-15, DS-60): it is the content of the layer, which scrolls under the title
// and the primary action. The sheet has two heights, and the list takes no scroll box of its own, even with `fit`.
export const ListScrollsInLayer: Story = {
  render: () => (
    <Layer>
      <ScrollEntries
        fit
        items={PLANTS}
        pageSize={4}
        label="Pflanzen"
        renderItem={(name) => <p className="rounded-lg border border-border p-3">{name}</p>}
      />
    </Layer>
  ),
  play: async ({ canvasElement }) => {
    const layer = await openLayer(canvasElement);
    const list = layer.querySelector("ul[aria-label='Pflanzen']");
    if (!list) throw new Error("play: the list is missing");
    if (list.children.length !== PLANTS.length)
      throw new Error("play: the list must hold every entry, not one page");
    if (layer.querySelector("[data-page-fit]"))
      throw new Error("play: a list in a layer takes no scroll box of its own");
    if (Array.from(layer.querySelectorAll("button")).some((b) => b.textContent === "Weiter"))
      throw new Error("play: a list in a layer has no Weiter");
    const sheet = sheetOf();
    if (sheet && hasLayout(sheet)) {
      await waitForKind(sheet, "two");
      await waitForHeight(sheet, visibleHeight() / 2, "the sheet opens at half height");
    }
    await closeLayer();
  },
};
