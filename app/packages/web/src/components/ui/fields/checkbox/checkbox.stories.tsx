import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "./checkbox";

// Catalog of the Checkbox states (TE-18): unchecked, checked, focus, disabled, invalid. The whole row is the 44 px target.
const meta = {
  title: "ui/Checkbox",
  component: Checkbox,
  args: { children: "Erinnerung senden" },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="p-4">
      <Checkbox {...args} />
    </div>
  ),
};

export const Checked: Story = {
  render: (args) => (
    <div className="p-4">
      <Checkbox {...args} defaultChecked />
    </div>
  ),
};

export const Focus: Story = {
  render: (args) => (
    <div className="p-4">
      <Checkbox {...args} autoFocus />
    </div>
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Checkbox {...args} disabled />
      <Checkbox {...args} disabled defaultChecked />
    </div>
  ),
};

export const Invalid: Story = {
  render: (args) => (
    <div className="flex flex-col gap-1 p-4">
      <Checkbox {...args} invalid aria-describedby="c-invalid-error">
        Bedingungen akzeptieren
      </Checkbox>
      <p id="c-invalid-error" className="text-sm text-destructive">
        Bitte zustimmen.
      </p>
    </div>
  ),
};
