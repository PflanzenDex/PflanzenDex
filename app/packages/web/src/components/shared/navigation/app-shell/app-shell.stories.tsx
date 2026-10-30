import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShell } from "./app-shell";
import { items, withRouter } from "../../shell/shell.fixtures";

// Catalog of the page frame (TE-18): phone, tablet and desktop come from the viewport toolbar.
const meta = {
  title: "shared/AppShell",
  component: AppShell,
  decorators: [withRouter],
  args: { items, children: <p>Inhalt der Seite</p> },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const ActiveInDrawer: Story = { parameters: { path: "/settings" } };
export const FewDestinations: Story = { args: { items: items.slice(0, 4) } };
export const Tablet: Story = { globals: { viewport: { value: "tablet", isRotated: false } } };
