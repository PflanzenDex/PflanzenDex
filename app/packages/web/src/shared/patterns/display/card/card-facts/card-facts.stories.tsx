import type { Meta, StoryObj } from "@storybook/react-vite";
import { check, must } from "@/shared/testing/story-frame/story-play";
import { CardFacts } from "./card-facts";

// Catalog of the two facts of a card front (US-QS-32, owner decisions d-159 and d-160). Light and dark come from the theme
// toolbar. The stars are drawn by a system font (outside the subset of the app font): look at them on the device.
const meta = {
  title: "data-display/CardFacts",
  component: CardFacts,
  args: { lightZone: 2, difficulty: 2 },
  decorators: [
    (Story) => (
      <div className="w-[320px] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CardFacts>;

export default meta;
type Story = StoryObj<typeof meta>;

// "Lichtzone 2" and "★★☆ Mittel": the two facts, in this order, and no more.
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const facts = Array.from(canvasElement.querySelectorAll("li"), (li) => li.textContent);
    check(facts.length === 2, "a card shows at most two facts");
    check(facts[0] === "Lichtzone 2", "the light zone comes first");
    check(must(facts[1], "the difficulty").includes("★★☆"), "the difficulty shows its stars");
  },
};

export const Easy: Story = { args: { lightZone: 3, difficulty: 1 } };

export const Hard: Story = { args: { lightZone: 4, difficulty: 3 } };

// An unknown value says "unbekannt" and shows no star and no number (P-08).
export const Unknown: Story = {
  args: { lightZone: null, difficulty: null },
  play: async ({ canvasElement }) => {
    const text = canvasElement.textContent ?? "";
    check(text.includes("Lichtzone unbekannt"), "an unknown light zone says so");
    check(text.includes("Schwierigkeit unbekannt"), "an unknown difficulty says so");
    check(!/[★☆]/.test(text), "an unknown value shows no star");
  },
};

// Both facts wrap inside a narrow card instead of widening it (SG-TYPE-04).
export const NarrowWraps: Story = {
  args: { lightZone: null, difficulty: null },
  decorators: [
    (Story) => (
      <div className="w-[200px] p-4">
        <Story />
      </div>
    ),
  ],
};
