import type { Meta, StoryObj } from "@storybook/react-vite";
import { items, withRouter } from "../../stories/shell/shell.fixtures";
import { navItems } from "../../../shared/patterns/navigation/navigation/navigation";
import { SideNav } from "./side-nav";

// Catalog of the side navigation (TE-18): rail from `md`, sidebar from `xl`; `show` forces a form visible at the phone width.
const meta = {
  title: "shared/SideNav",
  component: SideNav,
  decorators: [withRouter],
  args: { items },
} satisfies Meta<typeof SideNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Rail: Story = { args: { show: "rail" } };
export const RailActiveItem: Story = { args: { show: "rail" }, parameters: { path: "/pokedex" } };
export const Sidebar: Story = { args: { show: "sidebar" } };
export const SidebarActiveItem: Story = {
  args: { show: "sidebar" },
  parameters: { path: "/pokedex" },
};
export const Tablet: Story = { globals: { viewport: { value: "tablet", isRotated: false } } };

// The role entries under the heading "Verwaltung" (issue 1093): the last two destinations carry the group.
const withRoles = items.map((item, index) =>
  index >= items.length - 2 ? { ...item, group: "Verwaltung" } : item,
);
export const SidebarWithRoles: Story = { args: { show: "sidebar", items: withRoles } };

// A destination that is not open yet carries its text mark: "Freunde" next to "Noch gesperrt" keeps its label whole
// (US-QS-15, issue 1576). The real destinations, so the label is the one of the app.
const locked = navItems({ locks: { friends: "Noch gesperrt" } });
export const RailLockedMark: Story = { args: { show: "rail", items: locked } };
export const SidebarLockedMark: Story = { args: { show: "sidebar", items: locked } };
