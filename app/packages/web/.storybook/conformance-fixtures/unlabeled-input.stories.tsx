import type { Meta, StoryObj } from "@storybook/react-vite";

// Negative fixture for QG-U5 (never part of the catalog): an input without a label must fail axe.
const meta = {
  title: "conformance-fixture/UnlabeledInput",
  component: () => <input type="text" className="h-11 w-40 border" />,
} satisfies Meta;

export default meta;
export const Default: StoryObj<typeof meta> = {};
