import type { Meta, StoryObj } from "@storybook/react-vite";
import { MoreHelp } from "./more-help";

// Catalog of MoreHelp (TE-18, US-QS-24): the one line and the longer text behind "Mehr erfahren".
const meta = {
  title: "ui/MoreHelp",
  component: MoreHelp,
  args: {
    children: "Die Zone folgt dem Lux-Bedarf der Art.",
    more: "Stecklingslicht ist nie das Ziel für erwachsene Pflanzen.",
  },
} satisfies Meta<typeof MoreHelp>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
