import type { Meta, StoryObj } from "@storybook/react-vite";
import { Accordion } from "./accordion";

// Catalog of Accordion and Collapsible (TE-18, US-QS-07). Light and dark come from the theme toolbar. Toggle with
// Enter or Space; under reduced motion the height switches without animation.
const meta = {
  title: "data-display/Accordion",
  component: Accordion,
  args: {
    items: [
      { value: "licht", title: "Licht", content: "Heller Standort ohne direkte Mittagssonne." },
      {
        value: "wasser",
        title: "Wasser",
        content: "Gießen, wenn die oberen Zentimeter trocken sind.",
      },
      { value: "boden", title: "Boden", content: "Lockere, durchlässige Erde." },
    ],
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SeveralOpen: Story = { args: { defaultOpen: ["licht", "boden"] } };

export const LongTitleNarrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-[360px] p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    defaultOpen: ["a"],
    items: [
      {
        value: "a",
        title: "Philodendron hederaceum var. oxycardium: Pflege im Winter",
        content: "Weniger gießen und heller stellen.",
      },
    ],
  },
};
