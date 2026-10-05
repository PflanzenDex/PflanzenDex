import type { Meta, StoryObj } from "@storybook/react-vite";

// Negative fixture for QG-U5 (never part of the catalog): a 36 px hit area must fail the conformance run.
const meta = {
  title: "conformance-fixture/SmallTarget",
  component: () => (
    <button type="button" className="h-9 w-24 border">
      Klein
    </button>
  ),
} satisfies Meta;

export default meta;
export const Default: StoryObj<typeof meta> = {};
