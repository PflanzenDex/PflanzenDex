import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "../../display/label/label";
import { Textarea } from "./textarea";

// Catalog of the Textarea states (TE-18): default, focus, disabled, invalid.
const meta = {
  title: "ui/Textarea",
  component: Textarea,
  args: { placeholder: "Notiz zur Pflanze" },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Label htmlFor="t-default">Notiz</Label>
      <Textarea {...args} id="t-default" />
    </div>
  ),
};

export const Focus: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Label htmlFor="t-focus">Notiz</Label>
      <Textarea {...args} id="t-focus" autoFocus />
    </div>
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Label htmlFor="t-disabled">Notiz</Label>
      <Textarea {...args} id="t-disabled" disabled value="Gesperrt" readOnly />
    </div>
  ),
};

export const Invalid: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Label htmlFor="t-invalid">Notiz</Label>
      <Textarea {...args} id="t-invalid" invalid aria-describedby="t-invalid-error" />
      <p id="t-invalid-error" className="text-sm text-destructive">
        Die Notiz ist zu lang.
      </p>
    </div>
  ),
};
