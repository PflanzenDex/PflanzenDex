import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  clickButton,
  closeLayer,
  layerOf,
  openLayer,
  openTwoHeights,
  typeInto,
  sheetOf,
  visibleHeight,
  waitForHeight,
  waitForKind,
} from "@/shared/testing/story-frame/sheet-play";
import { withRouter } from "@/shared/testing/story-frame/story-frame";
import { hasLayout, pressEscape, waitUntil } from "@/shared/testing/story-frame/story-play";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { LayerSheet, useUnsavedInput } from "./layer-sheet";
import { Layer } from "./layer-sheet.heights.stories";

// More plays of the sheet and layer heights (US-QS-15; P-B, issue 2432): 200 % text, reduced motion, Escape and Back, the
// unsaved-input question and the scroll region of sheet, dialog and pane. The first plays are in `layer-sheet.heights.stories`.
const meta = {
  title: "shared/LayerSheet/States",
  component: LayerSheet,
  decorators: [withRouter],
  // The stories render their own layer (`Layer`); the args only satisfy the component's props.
  args: { id: "details", title: "Details", children: null },
} satisfies Meta<typeof LayerSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The text size of a story: 200 % of the browser's, set before the story renders and put back when it leaves. */
const largeText: Decorator = (Story) => {
  const root = document.documentElement;
  const before = root.style.fontSize;
  root.style.fontSize = "200%";
  useEffect(() => () => void (root.style.fontSize = before), [root, before]);
  return <Story />;
};

/** "Bewegung aus" of the keeper (US-QS-33): the page carries the marker that `tokens.css` and the sheet read. */
const reducedMotion: Decorator = (Story) => {
  const root = document.documentElement;
  root.dataset["motion"] = "reduced";
  useEffect(() => () => void delete root.dataset["motion"], [root]);
  return <Story />;
};

// 200 % text: title and actions do not fit within half height, so the sheet opens at full height and keeps one height.
export const LargeText: Story = {
  decorators: [largeText],
  render: () => <Layer long />,
  play: async ({ canvasElement }) => {
    await openLayer(canvasElement);
    const sheet = sheetOf();
    if (sheet && hasLayout(sheet)) {
      await waitForKind(sheet, "full");
      await waitForHeight(sheet, visibleHeight(), "the sheet opens at full height");
      if (document.querySelector('button[aria-label="Halbe Höhe"]'))
        throw new Error("play: a sheet with one height has no toggle");
    }
    await closeLayer();
  },
};

// Reduced motion: a change of height does not run a transition of the height.
export const ReducedMotion: Story = {
  decorators: [reducedMotion],
  render: () => <Layer long />,
  play: async ({ canvasElement }) => {
    const sheet = await openTwoHeights(canvasElement);
    if (!sheet) return;
    if (sheet.getAttribute("data-sheet-motion") !== "snap")
      throw new Error("play: a sheet with reduced motion marks its height changes as snapping");
    if (getComputedStyle(sheet).transitionProperty.includes("height"))
      throw new Error("play: the sheet must not transition its height with reduced motion");
    clickButton(sheet, "Vollbild");
    await waitForHeight(sheet, visibleHeight(), "the height snaps to full height", 1);
    await closeLayer();
  },
};

/** The step back of the browser, for a story whose router is in memory. */
function BackButton() {
  const navigate = useNavigate();
  return (
    <Button type="button" data-back="" onClick={() => void navigate(-1)}>
      Zurück
    </Button>
  );
}

// Escape, "Schließen" and Back close the layer at every height.
export const EscapeCloseAndBack: Story = {
  render: () => (
    <>
      <BackButton />
      <Layer long />
    </>
  ),
  play: async ({ canvasElement }) => {
    await openLayer(canvasElement);
    await closeLayer();
    await openLayer(canvasElement);
    clickButton(layerOf() as HTMLElement, "Schließen");
    await waitUntil(() => layerOf() === null, "Schließen closes the layer", 3000);
    await openLayer(canvasElement);
    canvasElement.querySelector<HTMLElement>("[data-back]")?.click();
    await waitUntil(() => layerOf() === null, "Back closes the layer", 3000);
  },
};

/** A field: typed input that is not saved makes the layer ask before it closes (US-QS-32); an empty field asks nothing. */
function Unsaved() {
  const [text, setText] = useState("");
  useUnsavedInput(text !== "");
  return (
    <label>
      Notiz
      <Input value={text} onChange={(event) => setText(event.target.value)} />
    </label>
  );
}

const question = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).find(
    (d) =>
      d.getAttribute("aria-label") === "Eingabe verwerfen?" ||
      d.textContent?.includes("Eingabe verwerfen?"),
  ) ?? null;

// Unsaved input: Escape asks "Eingabe verwerfen?" at half height too, "Weiter bearbeiten" keeps the layer.
export const UnsavedInputAsks: Story = {
  render: () => (
    <Layer>
      <Unsaved />
    </Layer>
  ),
  play: async ({ canvasElement }) => {
    const layer = await openLayer(canvasElement);
    const field = layer.querySelector("input");
    if (!field) throw new Error("play: the field is missing");
    typeInto(field, "Basilikum");
    pressEscape(document.activeElement ?? document.body);
    await waitUntil(() => question() !== null, "Escape asks before the layer closes", 3000);
    clickButton(question() as HTMLElement, "Weiter bearbeiten");
    await waitUntil(() => question() === null, "the question goes");
    if (layerOf() === null) throw new Error("play: Weiter bearbeiten keeps the layer open");
    pressEscape(document.activeElement ?? document.body);
    await waitUntil(() => question() !== null, "Escape asks again", 3000);
    clickButton(question() as HTMLElement, "Eingabe verwerfen");
    await waitUntil(() => layerOf() === null, "discarding closes the layer", 3000);
  },
};

// The content of the layer is its scroll region, whatever the layer is (sheet, dialog or pane); title and primary action stay.
export const ScrollRegion: Story = {
  render: () => <Layer long />,
  play: async ({ canvasElement }) => {
    const layer = await openLayer(canvasElement);
    // The region of the layer's own content, which the sheet's body, the dialog's body and the pane all hold.
    const region = layer.querySelector<HTMLElement>("[data-layer-body] > [data-scroll-region]");
    if (!region) throw new Error("play: the layer has no scroll region");
    const title = layer.querySelector("h2");
    const action = Array.from(layer.querySelectorAll("button")).find(
      (b) => b.textContent === "Sichern",
    );
    if (!title || !action) throw new Error("play: the title or the primary action is missing");
    if (region.contains(title))
      throw new Error("play: the title must stay outside the scroll region");
    if (region.contains(action))
      throw new Error("play: the primary action must stay outside the scroll region");
    await closeLayer();
  },
};
