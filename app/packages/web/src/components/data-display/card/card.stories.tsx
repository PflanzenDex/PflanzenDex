import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "@/components/ui/badge";
import { Card } from "./card";

// Catalog of the Card variants (TE-18, US-QS-07). Light and dark come from the theme toolbar. The link and button cards
// are the focusable ones; their focus ring is the shared ring (focus them with Tab).
const meta = {
  title: "data-display/Card",
  component: Card,
  args: { children: "Monstera deliciosa" },
  decorators: [
    (Story) => (
      <div className="max-w-sm p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

const picture = (
  <span aria-hidden="true" className="flex h-28 items-center justify-center bg-accent text-4xl">
    🌱
  </span>
);

export const Default: Story = {};

export const WithMediaAndFooter: Story = {
  args: {
    media: picture,
    footer: <Badge variant="outline">Lichtzone 2</Badge>,
    children: <span className="font-semibold">Monstera deliciosa</span>,
  },
};

export const AsLink: Story = { args: { href: "#arten", media: picture } };

export const AsButton: Story = { args: { onClick: () => undefined, media: picture } };

export const LongTextNarrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-[360px] p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    href: "#lang",
    children: "Philodendron hederaceum var. oxycardium mit einem sehr langen deutschen Namen",
  },
};
