import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlantControls } from "./plant-controls";

// Catalog of the controls of the plants in the Sammlung (US-QS-14): grouping and "Standorte verwalten".
const GROUPS = [
  { value: "all", label: "Alle" },
  { value: "phase", label: "Nach Pflegephase" },
  { value: "location", label: "Nach Standort" },
] as const;

const meta = {
  title: "shared/PlantControls",
  component: PlantControls,
  args: { group: "all", options: GROUPS, onGroup: () => undefined, onManage: () => undefined },
} satisfies Meta<typeof PlantControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {};
export const ByLocation: Story = { args: { group: "location" } };

export const Interactive: Story = {
  render: (args) => {
    const [group, setGroup] = useState(args.group);
    return <PlantControls {...args} group={group} onGroup={setGroup} />;
  },
};
