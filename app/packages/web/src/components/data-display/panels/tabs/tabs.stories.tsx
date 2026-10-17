import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs } from "./tabs";

// Catalog of Tabs (TE-18, US-QS-07). Light and dark come from the theme toolbar. Focus the selected tab with Tab, then
// move with the arrow keys, Home and End.
const meta = {
  title: "data-display/Tabs",
  component: Tabs,
  args: {
    label: "Pflegeprofil",
    tabs: [
      { value: "licht", label: "Licht", content: "Heller Standort ohne direkte Mittagssonne." },
      {
        value: "wasser",
        label: "Wasser",
        content: "Gießen, wenn die oberen Zentimeter trocken sind.",
      },
      { value: "boden", label: "Boden", content: "Lockere, durchlässige Erde." },
    ],
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SecondSelected: Story = { args: { defaultValue: "wasser" } };

export const ManyTabsNarrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-[360px] p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    tabs: ["Übersicht", "Pflege", "Messungen", "Fotos", "Notizen"].map((label) => ({
      value: label,
      label,
      content: `Inhalt: ${label}`,
    })),
  },
};
