import type { Meta, StoryObj } from "@storybook/react-vite";
import { SwipeCard } from "./swipe-card";
import type { SwipeDirection } from "./swipe-gesture";

// Catalog of the swipe card (US-ENT-01, US-TAU-02): drag it with the pointer, the stamp shows the decision before the release.
// The buttons of the deck are the way without a gesture (NFR-13); the stamps are the texts of the decks.
const stamps: Record<SwipeDirection, string> = {
  left: "Nein",
  right: "Ja",
  up: "Später",
  down: "Später",
};

const meta = {
  title: "elements/SwipeCard",
  component: SwipeCard,
  args: {
    exit: null,
    stamps,
    onSwipe: () => undefined,
    onExited: () => undefined,
    children: (
      <div className="flex flex-1 flex-col gap-2 rounded-xl border border-border bg-card p-3">
        <p className="m-0 text-xl font-semibold">Monstera deliciosa</p>
        <p className="m-0 text-sm">Ziehe die Karte nach links, rechts, oben oder unten.</p>
      </div>
    ),
  },
  decorators: [
    (Story) => (
      <div className="flex h-72 w-full max-w-sm flex-col p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SwipeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = { args: { disabled: true } };
