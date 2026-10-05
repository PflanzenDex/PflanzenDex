import type { Meta, StoryObj } from "@storybook/react-vite";
import { GlobalHeader } from "./global-header";
import { items, withRouter } from "./shell.fixtures";

// Catalog of the top bar (TE-18): destinations show from `md`, so the default story uses the tablet viewport.
const meta = {
  title: "shared/GlobalHeader",
  component: GlobalHeader,
  decorators: [withRouter],
  args: { items },
  globals: { viewport: { value: "tablet", isRotated: false } },
} satisfies Meta<typeof GlobalHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const ActiveItem: Story = { parameters: { path: "/pokedex" } };
export const Phone: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
