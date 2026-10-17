import type { Meta, StoryObj } from "@storybook/react-vite";
import { Popover } from "./popover";

// Catalog of Popover (TE-18, US-QS-07). Light and dark come from the theme toolbar. Open it with Enter or Space; Escape
// closes it and returns focus to the trigger.
const meta = {
  title: "data-display/Popover",
  component: Popover,
  args: { label: "Zur Pflanze", children: "Zuletzt gegossen am Montag." },
  decorators: [
    (Story) => (
      <div className="min-h-40 max-w-sm p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AlignedEnd: Story = {
  decorators: [
    (Story) => (
      <div className="flex min-h-40 w-[360px] justify-end p-4">
        <Story />
      </div>
    ),
  ],
  args: { align: "end", children: "Zuletzt gegossen am Montag, nächstes Mal am Freitag." },
};
