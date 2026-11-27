import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  clickButton,
  closeLayer,
  drag,
  heightOf,
  layerOf,
  liveText,
  openLayer,
  openTwoHeights,
  swipeFinger,
  press,
  sheetOf,
  visibleHeight,
  waitForHeight,
  waitForKind,
} from "@/shared/testing/story-frame/sheet-play";
import { withRouter } from "@/shared/testing/story-frame/story-frame";
import { hasLayout, waitUntil } from "@/shared/testing/story-frame/story-play";
import type { ReactNode } from "react";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { Button } from "@/shared/ui/button";
import { LayerHost, LayerOpener, LayerSheet } from "./layer-sheet";

// Plays of the sheet and layer heights (US-QS-15, owner decision 4 of 2026-11-21, issue 2412; owner answers 2026-11-21,
// issue 2415): fitting and half height, drag and snap, the toggle and the arrow keys with their announcement. The plays
// of 200 % text, reduced motion, Escape and Back, the unsaved-input question and the scroll region are in
// `layer-sheet.states.stories`. A play measures only where there is layout (the browser run of the conformance, 360 x 640
// px); the jsdom run checks the rest.
const meta = {
  title: "shared/LayerSheet/Heights",
  component: LayerSheet,
  decorators: [withRouter],
  // The stories render their own layer (`Layer`); the args only satisfy the component's props.
  args: { id: "details", title: "Details", children: null },
  // `Layer` is the helper of these stories and of `layer-sheet.states.stories`, no story.
  excludeStories: ["Layer"],
} satisfies Meta<typeof LayerSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The layer of the stories of the heights (US-QS-15): its opener, a title, a primary action and a list of 30 lines. */
const LINES = Array.from(
  { length: 30 },
  (_, index) => `Hinweis ${index + 1} zur Pflege dieser Pflanze.`,
);

/** A layer with its opener, inside the frame; `long` content is longer than half the window, short content fits within it. */
export function Layer(props: { long?: boolean; children?: ReactNode }) {
  return (
    <AnnouncerProvider>
      <LayerHost>
        <LayerOpener id="details">Details ansehen</LayerOpener>
        <LayerSheet id="details" title="Details" primaryAction={<Button>Sichern</Button>}>
          {props.children ?? (
            <ul className="flex flex-col gap-2">
              {(props.long ? LINES : LINES.slice(0, 2)).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </LayerSheet>
      </LayerHost>
    </AnnouncerProvider>
  );
}

// A content that fits within half the window opens at the height of its content.
export const FitsContent: Story = {
  render: () => <Layer />,
  play: async ({ canvasElement }) => {
    await openLayer(canvasElement);
    const sheet = sheetOf();
    if (sheet && hasLayout(sheet)) {
      await waitForKind(sheet, "fit");
      if (heightOf(sheet) >= visibleHeight() / 2)
        throw new Error("play: a short content must open below half height");
      if (document.querySelector('button[aria-label="Vollbild"]'))
        throw new Error("play: a sheet with one height has no toggle");
    }
    await closeLayer();
  },
};

// A longer content opens at half the window, and a swipe on it scrolls it without changing the height.
export const HalfHeight: Story = {
  render: () => <Layer long />,
  play: async ({ canvasElement }) => {
    await openLayer(canvasElement);
    const sheet = sheetOf();
    if (sheet && hasLayout(sheet)) {
      await waitForKind(sheet, "two");
      await waitForHeight(sheet, visibleHeight() / 2, "the sheet opens at half height");
      const region = sheet.querySelector<HTMLElement>("[data-layer-body] > [data-scroll-region]");
      if (!region || region.scrollHeight <= region.clientHeight)
        throw new Error("play: the content must scroll inside the sheet at half height");
      const top = region.scrollTop;
      const first = region.firstElementChild ?? region;
      drag(first, 500, 400, 300);
      region.scrollTop = top + 60;
      await waitUntil(() => region.scrollTop > top, "the content scrolls at half height");
      await waitForHeight(
        sheet,
        visibleHeight() / 2,
        "a swipe on the content does not grow the sheet",
      );
    }
    await closeLayer();
  },
};

// A drag on the handle snaps to the nearer height; a long drag down past half closes the sheet.
export const DragSnaps: Story = {
  render: () => <Layer long />,
  play: async ({ canvasElement }) => {
    const sheet = await openTwoHeights(canvasElement);
    if (!sheet) return;
    const handle = sheet.querySelector<HTMLElement>("[data-sheet-handle]");
    if (!handle) throw new Error("play: the handle is missing");
    const half = visibleHeight() / 2;
    drag(handle, half, half - 200, half - 250);
    await waitForHeight(sheet, visibleHeight(), "a drag up snaps to full height");
    drag(handle, 60, 200, 300);
    await waitForHeight(sheet, half, "a drag down to the middle snaps back to half height");
    drag(handle, half, half + 150, half + 300);
    await waitUntil(() => layerOf() === null, "a long drag down past half closes the sheet", 3000);
  },
};

// A swipe down on the content drags the sheet only when the content is at its top; otherwise the content scrolls (US-QS-15).
export const SwipeDownAtTop: Story = {
  render: () => <Layer long />,
  play: async ({ canvasElement }) => {
    const sheet = await openTwoHeights(canvasElement);
    if (!sheet) return;
    const region = sheet.querySelector<HTMLElement>("[data-layer-body] > [data-scroll-region]");
    const first = region?.firstElementChild;
    if (!region || !first) throw new Error("play: the content of the layer is missing");
    const half = visibleHeight() / 2;
    // Not at the top: the swipe scrolls the content and the sheet keeps its height.
    region.scrollTop = 80;
    swipeFinger(first, half + 100, half + 200, half + 300);
    await waitForHeight(sheet, half, "the sheet keeps half height while the content scrolls");
    // At the top: a swipe up scrolls, a swipe down drags the sheet, and far enough past half it closes.
    region.scrollTop = 0;
    swipeFinger(first, half + 200, half + 100);
    await waitForHeight(sheet, half, "a swipe up does not change the height");
    swipeFinger(first, half + 100, half + 200, half + 320);
    await waitUntil(
      () => layerOf() === null,
      "a long swipe down at the top closes the sheet",
      3000,
    );
  },
};

// The toggle and the arrow keys change the height and announce it; arrow down at half height never closes the sheet.
export const ToggleAndKeys: Story = {
  render: () => <Layer long />,
  play: async ({ canvasElement }) => {
    const sheet = await openTwoHeights(canvasElement);
    if (!sheet) return;
    clickButton(sheet, "Vollbild");
    await waitForHeight(sheet, visibleHeight(), "the toggle grows the sheet to full height");
    await waitUntil(() => liveText() === "Details, Vollbild", "the change is announced");
    clickButton(sheet, "Halbe Höhe");
    await waitForHeight(sheet, visibleHeight() / 2, "the toggle returns to half height");
    await waitUntil(() => liveText() === "Details, Halbe Höhe", "the way back is announced");
    const handle = sheet.querySelector<HTMLElement>("[data-sheet-handle]") as HTMLElement;
    handle.focus();
    press(handle, "ArrowUp");
    await waitForHeight(sheet, visibleHeight(), "arrow up grows the sheet to full height");
    await waitUntil(
      () => handle.getAttribute("aria-valuetext") === "Details, Vollbild",
      "the value text of the handle says the new height",
    );
    press(handle, "ArrowDown");
    await waitForHeight(sheet, visibleHeight() / 2, "arrow down returns it to half height");
    const said = liveText();
    press(handle, "ArrowDown");
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (layerOf() === null || liveText() !== said)
      throw new Error("play: arrow down at half height must keep the sheet open and say nothing");
    await closeLayer();
  },
};
