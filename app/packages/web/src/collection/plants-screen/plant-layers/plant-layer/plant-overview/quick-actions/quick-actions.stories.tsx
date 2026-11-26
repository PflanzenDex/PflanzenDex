import { useContext, useRef } from "react";
import { createPortal } from "react-dom";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { SpecimenCard } from "@pflanzendex/core";
import { UndoRow } from "@/shared/feedback/undo-row/undo-row";
import { useReturnFocus, useUndo } from "@/shared/feedback/undo-row/use-undo";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { LayerHost, LayerOpener } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { plantLayerId } from "@/shared/patterns/navigation/navigation/navigation";
import {
  closeLayer,
  heightOf,
  liveText,
  openLayer,
  sheetOf,
  visibleHeight,
  waitForHeight,
} from "@/shared/testing/story-frame/sheet-play";
import { withRouter } from "@/shared/testing/story-frame/story-frame";
import { check, hasLayout, must, waitUntil } from "@/shared/testing/story-frame/story-play";
import { Button } from "@/shared/ui/button/button";
import { PlantLayer } from "../../plant-layer";
import { ResultHost } from "../../plant-layer.slot";

// The result of "Gießen" in the plant layer at half height (US-QS-15, owner decision d-130, issue 2536): the line directly
// below the quick actions says "Gegossen heute · Rückgängig", the focus stays on "Gießen" and the content does not scroll.
// The slot below is the contract of `monitoring`'s `WaterAction` without its write (that module is wired by the app, not
// known to `collection`): the same `useUndo`, `UndoRow` with `keepFocus` and `useReturnFocus`. A play measures only where
// there is layout (the browser run, 360 x 640 px); the jsdom run checks the order of the page and the focus.
const meta = {
  title: "collection/PlantLayer/QuickActions",
  component: Layer,
  decorators: [withRouter],
} satisfies Meta<typeof Layer>;

export default meta;
type Story = StoryObj<typeof meta>;

const CARD: SpecimenCard = {
  id: "e1",
  name: "Aloe",
  speciesId: "a1",
  marker: null,
  speciesName: "Aloe vera",
  status: "plant",
  location: "Regal Süd",
  lightZone: "Zone 3",
  lightZoneSource: "location",
  lightNeedUnknown: false,
  caughtAt: "2026-09-01",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  provenance: null,
  moreTreatments: 0,
};

/** "Gießen" of the monitoring module without its write: a tap holds the result with its undo, drawn into the line under the row. */
function Water(props: { card: SpecimenCard }) {
  const host = useContext(ResultHost);
  const undo = useUndo<string>();
  const button = useRef<HTMLButtonElement>(null);
  const held = undo.held.length > 0;
  useReturnFocus(held, button);
  const { id, name } = props.card;
  return (
    <>
      <Button
        ref={button}
        type="button"
        variant="tinted"
        aria-label={`Gießen: ${name}`}
        onClick={() =>
          undo.hold([{ key: id, group: id, item: id, index: 0, undoable: true }], "Gegossen heute")
        }
      >
        Gießen
      </Button>
      {held && host
        ? createPortal(
            <UndoRow
              result="Gegossen heute"
              subject={name}
              keepFocus
              compact
              onUndo={() => undo.release(id)}
            />,
            host,
          )
        : null}
    </>
  );
}

/** The plant layer with its opener, inside the frame: the overview of a plant, longer than half the window. */
function Layer() {
  return (
    <AnnouncerProvider>
      <LayerHost>
        <LayerOpener id={plantLayerId(CARD.id)}>Aloe ansehen</LayerOpener>
        <PlantLayer
          card={CARD}
          photoAccess={{ api: "", token: async () => undefined }}
          onMeasure={() => undefined}
          onManage={() => undefined}
          slots={{ water: (card) => <Water card={card} /> }}
        />
      </LayerHost>
    </AnnouncerProvider>
  );
}

const button = (scope: ParentNode, name: string) =>
  must(
    Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.getAttribute("aria-label") === name || b.textContent?.trim() === name,
    ),
    `the button "${name}"`,
  );

/** Waits until the sheet has stopped sliding in: the top of `element` is the same in six polls in a row (150 ms). */
async function still(element: Element): Promise<void> {
  let last = Number.NaN;
  let same = 0;
  await waitUntil(() => {
    const top = element.getBoundingClientRect().top;
    same = top === last ? same + 1 : 0;
    last = top;
    return same >= 6;
  }, "the sheet stands still");
}

// The result and its undo show under the row of the quick actions and stay in view; the focus stays on "Gießen", and the
// content of the sheet keeps its scroll position and its place at half height.
export const ResultBelowRow: Story = {
  render: () => <Layer />,
  play: async ({ canvasElement }) => {
    const layer = await openLayer(canvasElement);
    const sheet = sheetOf();
    const region = must(
      layer.querySelector<HTMLElement>("[data-layer-body] > [data-scroll-region]"),
      "the scroll region of the layer",
    );
    const row = must(
      layer.querySelector<HTMLElement>('[role="group"][aria-label="Schnellaktionen"]'),
      "the row of the quick actions",
    );
    const water = button(row, "Gießen: Aloe");
    const measured = sheet !== null && hasLayout(sheet);
    // At 200 % text the sheet has full height only (title and actions fill half): the play then keeps that height.
    let height = 0;
    if (sheet && measured) {
      await waitUntil(
        () => ["two", "full"].includes(sheet.getAttribute("data-sheet-height") ?? ""),
        "the sheet has its heights",
      );
      if (sheet.getAttribute("data-sheet-height") === "two")
        await waitForHeight(sheet, visibleHeight() / 2, "the sheet opens at half height");
      await still(water);
      height = heightOf(sheet);
      region.scrollTop = 40;
    }
    const scrolled = region.scrollTop;
    const before = measured ? water.getBoundingClientRect().top : 0;
    water.focus();
    water.click();
    // Under the row, in the part that stays in place, outside the content that scrolls.
    const line = must(row.nextElementSibling, "the line under the row");
    await waitUntil(
      () => line.textContent === "Gegossen heute · Rückgängig",
      "the result and its undo show under the row",
    );
    check(line.closest("[data-sheet-pinned]") !== null, "the line stays in place");
    check(!region.contains(line), "the line is not in the scrolling content");
    check(document.activeElement === water, "the focus stays on Gießen");
    await waitUntil(() => liveText() === "Gegossen heute", "the result is announced once");
    if (sheet && measured) {
      check(region.scrollTop === scrolled, "the content did not scroll");
      check(water.getBoundingClientRect().top === before, "Gießen did not move");
      check(
        line.getBoundingClientRect().top >= row.getBoundingClientRect().bottom - 1,
        "the line is below the row",
      );
      check(
        line.getBoundingClientRect().bottom <= sheet.getBoundingClientRect().bottom,
        "the line is in the sheet, in view",
      );
      await waitForHeight(sheet, height, "the sheet keeps its height");
    }
    // The undo takes the entry back; the focus is still on Gießen, and the line is empty again.
    button(line, "Rückgängig: Aloe").click();
    await waitUntil(() => line.childNodes.length === 0, "the undo takes the result away");
    check(document.activeElement === water, "the focus is on Gießen after the undo");
    await closeLayer();
  },
};
