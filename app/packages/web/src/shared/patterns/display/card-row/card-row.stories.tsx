import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/shared/ui/button";
import { check, hasLayout, must, waitUntil } from "@/shared/testing/story-frame/story-play";
import { CardRow } from "./card-row";

// Catalog of the card row, a sideways shelf in which the next card peeks in (US-QS-15, SG-LIST-01; DS-61, DS-63). Light and
// dark come from the theme toolbar. Scroll it with a swipe or the arrow keys when it has the focus; each card snaps to the start.
const meta = {
  title: "data-display/CardRow",
  component: CardRow,
  args: { label: "Sammlerkarten nebeneinander", children: null },
  decorators: [
    (Story) => (
      <div className="w-[360px] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CardRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const NAMES = ["Monstera deliciosa", "Pilea peperomioides", "Calathea orbifolia", "Aloe vera"];

const cards = NAMES.map((name) => (
  <article
    key={name}
    aria-label={name}
    className="grid h-48 content-between rounded-card bg-card p-3 shadow-elevation-1"
  >
    <p className="m-0 text-xl font-semibold">{name}</p>
    <Button variant="plain" size="sm" className="w-fit">
      Mehr
    </Button>
  </article>
));

export const Default: Story = { args: { children: cards } };

/** The part of `card` that shows inside the box of `row`, in px. */
function visibleSlice(row: HTMLElement, card: HTMLElement): number {
  const box = row.getBoundingClientRect();
  const at = card.getBoundingClientRect();
  return Math.max(0, Math.min(at.right, box.right) - Math.max(at.left, box.left));
}

// The next card peeks in: a slice of the second card, at least 8 px and at most 40 % of the shelf, shows beside the first
// (starting values, assumption; the feel of the peek stays with the device check, issue 2425 matrix row 23).
export const NextCardPeeks: Story = {
  args: { children: cards },
  play: async ({ canvasElement }) => {
    const row = must(canvasElement.querySelector<HTMLElement>("[data-scroll-x]"), "the shelf");
    check(row.getAttribute("data-scroll-x") === "cards", "the shelf is marked data-scroll-x=cards");
    if (!hasLayout(row)) return;
    const second = must(canvasElement.querySelectorAll<HTMLElement>("li")[1], "the second card");
    const slice = visibleSlice(row, second);
    check(slice >= 8, `the next card peeks in by at least 8 px (it shows ${slice} px)`);
    check(
      slice <= row.clientWidth * 0.4,
      `the next card shows at most 40 % of the shelf (it shows ${slice} px)`,
    );
  },
};

// A focus inside a card scrolls that card into view and the shelf scrolls sideways to reach it.
export const FocusedCardInView: Story = {
  args: { children: cards },
  play: async ({ canvasElement }) => {
    const row = must(canvasElement.querySelector<HTMLElement>("[data-scroll-x]"), "the shelf");
    if (!hasLayout(row)) return;
    check(row.scrollWidth > row.clientWidth, "the shelf overflows, so the story proves something");
    const last = must(
      canvasElement.querySelectorAll<HTMLElement>("li button")[NAMES.length - 1],
      "the button of the last card",
    );
    last.focus();
    const card = must(last.closest("li"), "the last card");
    await waitUntil(
      () => row.scrollLeft > 0 && visibleSlice(row, card) >= card.clientWidth - 1,
      "the focused card scrolls into the shelf",
    );
  },
};
