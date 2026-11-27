import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/shared/ui/button";
import { check, hasLayout, must } from "@/shared/testing/story-frame/story-play";
import { ChipRow } from "./chip-row";

// Catalog of the chip row (US-QS-15, SG-LIST-06, DS-63): the marked sideways region `chips`. It wraps while the chips fit and
// scrolls sideways inside itself when they do not. Light and dark come from the theme toolbar.
const meta = {
  title: "data-display/ChipRow",
  component: ChipRow,
  args: { label: "Zum Standort springen", scroll: false, children: null },
  decorators: [
    (Story) => (
      <div className="w-[360px] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChipRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const chips = (names: readonly string[]) =>
  names.map((name, index) => (
    <Button key={name} variant="plain" size="sm" type="button">
      {name} <span className="tabular-nums">({index + 1})</span>
    </Button>
  ));

export const Fits: Story = {
  args: { children: chips(["Küche", "Bad", "Flur"]) },
  play: async ({ canvasElement }) => {
    const row = must(canvasElement.querySelector<HTMLElement>("[data-scroll-x]"), "the chip row");
    check(row.getAttribute("data-scroll-x") === "chips", "the row is marked data-scroll-x=chips");
    if (hasLayout(row))
      check(row.scrollWidth <= row.clientWidth + 1, "chips that fit do not scroll");
  },
};

// Chips that do not fit stay in one line and the row scrolls sideways inside itself; the page does not scroll sideways.
export const ScrollsSideways: Story = {
  args: {
    scroll: true,
    children: chips([
      "Küche",
      "Wohnzimmer",
      "Schlafzimmer",
      "Badezimmer",
      "Arbeitszimmer",
      "Standort unbekannt",
    ]),
  },
  play: async ({ canvasElement }) => {
    const row = must(canvasElement.querySelector<HTMLElement>("[data-scroll-x]"), "the chip row");
    check(row.getAttribute("data-scroll-x") === "chips", "the row is marked data-scroll-x=chips");
    if (!hasLayout(row)) return;
    check(row.scrollWidth > row.clientWidth, "the chips overflow the row, so it scrolls");
    check(
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      "the page does not scroll sideways",
    );
  },
};
