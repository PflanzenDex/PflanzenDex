import type { Meta, StoryObj } from "@storybook/react-vite";
import { Menu } from "./menu";

// Catalog of Menu (TE-18, US-QS-07). Light and dark come from the theme toolbar. Open with Enter, Space or ArrowDown;
// move with the arrow keys, Home and End; Escape closes and returns focus to the trigger.
const meta = {
  title: "data-display/Menu",
  component: Menu,
  args: {
    label: "Weitere Aktionen",
    items: [
      { label: "Umtopfen", onSelect: () => undefined },
      { label: "Bearbeiten", onSelect: () => undefined },
      { label: "Archivieren", onSelect: () => undefined, disabled: true },
      { label: "Löschen", onSelect: () => undefined, destructive: true },
    ],
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-56 w-[360px] justify-end p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Menu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AlignedStart: Story = {
  decorators: [
    (Story) => (
      <div className="min-h-56 w-[360px] p-4">
        <Story />
      </div>
    ),
  ],
  args: { align: "start" },
};
