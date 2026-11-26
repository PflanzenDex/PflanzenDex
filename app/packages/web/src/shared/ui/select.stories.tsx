import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "./label";
import { Select } from "./select";

// Catalog of the Select states (TE-18): default, focus, disabled, invalid. Styled native select (ADR 0007).
const meta = {
  title: "ui/Select",
  component: Select,
  args: {
    children: (
      <>
        <option value="">Bitte wählen</option>
        <option value="1">Zone 1</option>
        <option value="2">Zone 2</option>
      </>
    ),
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Label htmlFor="s-default">Lichtzone</Label>
      <Select {...args} id="s-default" />
    </div>
  ),
};

export const Focus: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Label htmlFor="s-focus">Lichtzone</Label>
      <Select {...args} id="s-focus" autoFocus />
    </div>
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Label htmlFor="s-disabled">Lichtzone</Label>
      <Select {...args} id="s-disabled" disabled />
    </div>
  ),
};

export const Invalid: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Label htmlFor="s-invalid">Lichtzone</Label>
      <Select {...args} id="s-invalid" invalid aria-describedby="s-invalid-error" />
      <p id="s-invalid-error" className="text-sm text-destructive">
        Bitte eine Lichtzone wählen.
      </p>
    </div>
  ),
};

// A value that does not fit at 360 px and 200 % text ends with an ellipsis (US-QS-32, issue 1960).
export const LongValue: Story = {
  render: () => (
    <div className="flex w-[360px] flex-col gap-2 p-4">
      <Label htmlFor="s-long">Lichtzone</Label>
      <Select id="s-long" defaultValue="long">
        <option value="long">Zone 3 (Stecklingslicht mit Zusatzlicht im Gewächshaus)</option>
        <option value="short">Zone 1</option>
      </Select>
    </div>
  ),
};
