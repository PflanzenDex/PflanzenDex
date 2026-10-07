import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SammlungHeader } from "./sammlung-header";

// Catalog of the title area of the destination "Sammlung" (US-QS-14): plants and species mode, with and without the count line.
const meta = {
  title: "shared/SammlungHeader",
  component: SammlungHeader,
  args: {
    view: "plants",
    options: [
      { value: "plants", label: "Pflanzen" },
      { value: "species", label: "Arten" },
    ],
    onChoose: () => undefined,
    caption: null,
  },
} satisfies Meta<typeof SammlungHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};
export const Plants: Story = { args: { caption: "12 Pflanzen" } };
export const Species: Story = { args: { view: "species", caption: "7 gefangen" } };

export const Interactive: Story = {
  render: (args) => {
    const [view, setView] = useState(args.view);
    return <SammlungHeader {...args} view={view} onChoose={setView} caption="12 Pflanzen" />;
  },
};
