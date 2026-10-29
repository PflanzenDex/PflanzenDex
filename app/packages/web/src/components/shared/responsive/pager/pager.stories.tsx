import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { Pager } from "./pager";

// Catalog of the Pager (US-QS-15, DS-58): 360 px, light and dark from the toolbar.
const plants = Array.from({ length: 11 }, (_, i) => `Monstera ${i + 1}`);

const meta = {
  title: "shared/Pager",
  component: Pager<string>,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  args: {
    items: plants,
    pageSize: 4,
    label: "Pflanzen",
    renderItem: (name: string) => (
      <p className="rounded-lg border border-border p-3 font-semibold">{name}</p>
    ),
  },
} satisfies Meta<typeof Pager<string>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const OnePage: Story = { args: { items: plants.slice(0, 3) } };
