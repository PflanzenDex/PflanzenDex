import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { withText200 } from "@/shared/testing/story-frame/story-frame";
import { Stepper } from "./stepper";

// Catalog of the Stepper (TE-18, US-QS-32, SG-CTRL-04): a whole number from 0 to 10 with "Weniger" and "Mehr", 44 px each,
// at the limits and at 200 % text, where the label wraps and the buttons stay beside the value or move below the label.
const meta = {
  title: "ui/Stepper",
  component: Stepper,
  args: { label: "Mindestzahl offener Wünsche je Zone", value: 2, onChange: () => undefined },
  decorators: [
    (Story) => (
      <div className="w-[360px] bg-background p-4">
        <Story />
      </div>
    ),
  ],
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <Stepper {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof Stepper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AtMinimum: Story = { args: { value: 0 } };

export const AtMaximum: Story = { args: { value: 10 } };

export const At200Text: Story = { decorators: [withText200] };
