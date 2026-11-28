import { useLayoutEffect } from "react";
import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import type { SensorView } from "@pflanzendex/core";
import { withText200 } from "@/shared/testing/story-frame/story-frame";
import { check, hasLayout, must, waitUntil } from "@/shared/testing/story-frame/story-play";
import { SensorsView } from "./sensors-view";

// Catalog of the sensor assignment (US-QS-32, Q-108, issue 2307): a row that shows the place of the sensor and opens a pick list.
// The plays measure in the browser (`make sb-test`, the conformance run): the 55-character plant name shows whole in the row and
// in the list at 360 px and at 200 % text, and nothing runs sideways. jsdom has no layout, so a measure passes there.
const LONG = "Gummibaum aus dem Wohnzimmer am großen Südfenster links";

const view: SensorView = {
  sensors: [
    {
      id: "s1",
      name: "Bodenfeuchte-Sensor",
      status: "active",
      target: { kind: "specimen", id: "p2", name: LONG },
    },
  ],
  specimens: [
    { id: "p1", name: "Aloe" },
    { id: "p2", name: LONG },
    { id: "p3", name: "Monstera deliciosa" },
  ],
  locations: [
    { id: "l1", name: "Fenster" },
    { id: "l2", name: "Bad" },
  ],
};

/** The app sets `lang="de"` on the document, and a long word breaks at a syllable with a hyphen only then (issue 2366). */
const withGerman: Decorator = (Story) => {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const before = root.lang;
    root.lang = "de";
    return () => {
      root.lang = before;
    };
  }, []);
  return <Story />;
};

const meta = {
  title: "equipment/SensorsView",
  component: SensorsView,
  args: { view, actions: { busy: false, onTarget: async () => true } },
  decorators: [
    withGerman,
    (Story) => (
      <div className="w-[360px] bg-background p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SensorsView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The place line of the row holds the whole name: it wraps, nothing is cut, nothing runs sideways. */
function checkRow(canvas: HTMLElement): void {
  const row = must(canvas.querySelector<HTMLElement>("button[aria-haspopup=dialog]"), "the row");
  const place = must(
    Array.from(row.querySelectorAll<HTMLElement>("span")).find((s) => s.textContent === LONG),
    "the place line",
  );
  if (!hasLayout(place)) return;
  const box = place.getBoundingClientRect();
  const line = parseFloat(getComputedStyle(place).lineHeight);
  check(place.scrollWidth <= place.clientWidth + 1, "the place line runs sideways");
  check(box.height >= line * 2 - 1, `the long name did not wrap (${box.height} px high)`);
  check(row.scrollWidth <= row.clientWidth + 1, "the row runs sideways");
  check(row.getBoundingClientRect().height >= 44, "the row is below 44 px");
}

export const LongPlantName: Story = {
  play: ({ canvasElement }) => checkRow(canvasElement),
};

export const LongPlantNameAt200Percent: Story = {
  decorators: [withText200],
  play: async ({ canvasElement }) => {
    // jsdom has no layout and no rem: only the browser run waits for the text size and measures.
    if (hasLayout(canvasElement))
      await waitUntil(
        () => parseFloat(getComputedStyle(document.documentElement).fontSize) >= 31,
        "the text is 200 %",
      );
    checkRow(canvasElement);
  },
};

/** The pick list of the row: the whole name of every entry, nothing runs sideways, the list scrolls inside its sheet. */
async function checkList(canvas: HTMLElement): Promise<void> {
  const row = must(
    canvas.querySelector<HTMLButtonElement>("button[aria-haspopup=dialog]"),
    "the row",
  );
  row.click();
  await waitUntil(
    () => document.querySelector("[role=dialog] [data-pick-entry]") !== null,
    "the list opens",
  );
  const dialog = must(document.querySelector<HTMLElement>("[role=dialog]"), "the list");
  const entry = must(
    Array.from(dialog.querySelectorAll<HTMLElement>("[data-pick-entry]")).find((e) =>
      e.textContent?.includes(LONG),
    ),
    "the entry of the long name",
  );
  if (!hasLayout(entry)) return;
  const text = must(entry.querySelector<HTMLElement>("span"), "the name of the entry");
  const line = parseFloat(getComputedStyle(text).lineHeight);
  check(entry.scrollWidth <= entry.clientWidth + 1, "the entry runs sideways");
  check(
    text.getBoundingClientRect().height >= line * 2 - 1,
    "the long name did not wrap in its entry",
  );
  check(entry.getBoundingClientRect().height >= 44, "the entry is below 44 px");
  check(dialog.scrollWidth <= dialog.clientWidth + 1, "the list sheet runs sideways");
  const search = must(dialog.querySelector<HTMLElement>("input[type=search]"), "the search field");
  check(search.getBoundingClientRect().height >= 44, "the search field is below 44 px");
  check(
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    "the page runs sideways",
  );
}

export const PickList: Story = {
  play: ({ canvasElement }) => checkList(canvasElement),
};

export const PickListAt200Percent: Story = {
  decorators: [withText200],
  play: async ({ canvasElement }) => {
    if (hasLayout(canvasElement))
      await waitUntil(
        () => parseFloat(getComputedStyle(document.documentElement).fontSize) >= 31,
        "the text is 200 %",
      );
    await checkList(canvasElement);
  },
};

/** The keyboard path in the browser: the list opens with the focus in its search, the arrow down leads into the list, a pick closes it and the focus is back on the row. */
async function pickWithKeys(canvas: HTMLElement): Promise<void> {
  const row = must(
    canvas.querySelector<HTMLButtonElement>("button[aria-haspopup=dialog]"),
    "the row",
  );
  row.focus();
  row.click();
  await waitUntil(
    () => document.activeElement?.matches("[role=dialog] input[type=search]") === true,
    "the focus is in the search",
  );
  document.activeElement?.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );
  await waitUntil(
    () => document.activeElement?.matches("[data-pick-entry]") === true,
    "the arrow down leads into the list",
  );
  const aloe = must(
    Array.from(document.querySelectorAll<HTMLElement>("[data-pick-entry]")).find(
      (e) => e.textContent === "Aloe",
    ),
    "the entry Aloe",
  );
  aloe.focus();
  aloe.click();
  await waitUntil(() => document.querySelector("[role=dialog]") === null, "the list closes");
  await waitUntil(() => document.activeElement === row, "the focus is back on the row");
  await waitUntil(
    () => canvas.textContent?.includes("Zugeordnet: Aloe · Rückgängig") === true,
    "the row says the result with its undo",
  );
}

export const PickWithTheKeyboard: Story = {
  play: ({ canvasElement }) => pickWithKeys(canvasElement),
};
