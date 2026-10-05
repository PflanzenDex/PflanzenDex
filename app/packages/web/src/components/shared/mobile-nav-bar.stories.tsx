import type { Meta, StoryObj } from "@storybook/react-vite";
import { MobileNavBar } from "./mobile-nav-bar";
import { items, withRouter } from "./shell.fixtures";

// Catalog of the bottom bar (TE-18): shown below `md`, so the viewport stays on the phone preset (360 px).
const meta = {
  title: "shared/MobileNavBar",
  component: MobileNavBar,
  decorators: [withRouter],
  args: { items },
} satisfies Meta<typeof MobileNavBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const ActiveInBar: Story = { parameters: { path: "/collection" } };
export const ActiveInDrawer: Story = { parameters: { path: "/settings" } };
export const FewDestinations: Story = { args: { items: items.slice(0, 4) } };
