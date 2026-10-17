import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SegmentedControl } from "./segmented-control";

// Catalog of the segmented control (US-QS-14): two choices, three choices, focus. Every segment is a 44 px target.
const meta = {
  title: "shared/SegmentedControl",
  component: SegmentedControl,
  args: { label: "Ansicht", value: "plants", options: [], onChange: () => undefined },
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo(props: { options: { value: string; label: string }[]; autoFocus?: boolean }) {
  const [value, setValue] = useState(props.options[0]?.value ?? "");
  return (
    <div className="p-4">
      <SegmentedControl label="Ansicht" options={props.options} value={value} onChange={setValue} />
    </div>
  );
}

const TWO = [
  { value: "plants", label: "Pflanzen" },
  { value: "species", label: "Arten" },
];

export const TwoChoices: Story = { render: () => <Demo options={TWO} /> };

export const ThreeChoices: Story = {
  render: () => <Demo options={[...TWO, { value: "wishes", label: "Wünsche" }]} />,
};

export const Focus: Story = {
  render: () => (
    <div className="p-4">
      <SegmentedControl label="Ansicht" options={TWO} value="species" onChange={() => undefined} />
    </div>
  ),
  play: ({ canvasElement }) => {
    canvasElement.querySelector<HTMLInputElement>("input:checked")?.focus();
  },
};
