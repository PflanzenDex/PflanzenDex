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
import { Button } from "@/shared/ui/button";
import { PlantLayer } from "../../plant-layer";
import { ResultHost } from "../../plant-layer.slot";

// The result of "Gießen" at half height (US-QS-15, owner decision d-130, issue 2536): the line under the quick actions says
// "Gegossen heute · Rückgängig", the focus stays on "Gießen", the content does not scroll. The slot is `monitoring`'s `WaterAction`
// without its write (`collection` does not know that module): the same `useUndo`, `UndoRow` with `keepFocus`, `useReturnFocus`.
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

let calls = 0; // the handlers of the layer only count a call: it opens no form here, and the token is never asked

async function onlyCount(): Promise<undefined> {
  calls += 1;
  return undefined;
}

/** The plant layer with its opener, inside the frame: the overview of a plant, longer than half the window. */
function Layer() {
  return (
    <AnnouncerProvider>
      <LayerHost>
        <LayerOpener id={plantLayerId(CARD.id)}>Aloe ansehen</LayerOpener>
        <PlantLayer
          card={CARD}
          photoAccess={{ api: "", token: onlyCount }}
          onMeasure={onlyCount}
          onManage={onlyCount}
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
    same = element.getBoundingClientRect().top === last ? same + 1 : 0;
    last = element.getBoundingClientRect().top;
    return same >= 6;
  }, "the sheet stands still");
}

// The result and its undo show under the row of the quick actions and stay in view; the focus stays on "Gießen", and the
// content of the sheet keeps its scroll position and its place at half height.
export const ResultBelowRow: Story = {
  render: () => <Layer />,
  play: async ({ canvasElement }) => {
    calls = 0;
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
    let height = 0; // at 200 % text the sheet has full height only: the play keeps the height it opens at
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
    button(line, "Rückgängig: Aloe").click();
    await waitUntil(() => line.childNodes.length === 0, "the undo takes the result away");
    check(document.activeElement === water, "the focus is on Gießen after the undo");
    button(row, "Messen: Aloe").click();
    check(calls === 1, "Messen calls its handler");
    await closeLayer();
  },
};
