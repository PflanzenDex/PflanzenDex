import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";
import { Label } from "./label";

// Catalog of the Input states (TE-18): default, focus, disabled, invalid and the input types. Light and dark come from the toolbar.
const meta = {
  title: "ui/Input",
  component: Input,
  args: { placeholder: "z. B. Monstera" },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Label htmlFor="i-default">Name</Label>
      <Input {...args} id="i-default" />
    </div>
  ),
};

export const Focus: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Label htmlFor="i-focus">Name</Label>
      <Input {...args} id="i-focus" autoFocus />
    </div>
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Label htmlFor="i-disabled">Name</Label>
      <Input {...args} id="i-disabled" disabled value="Gesperrt" readOnly />
    </div>
  ),
};

export const Invalid: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Label htmlFor="i-invalid">Name</Label>
      <Input {...args} id="i-invalid" invalid aria-describedby="i-invalid-error" />
      <p id="i-invalid-error" className="text-sm text-destructive">
        Bitte einen Namen eingeben.
      </p>
    </div>
  ),
};

export const Types: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="i-date">Gefangen am</Label>
        <Input id="i-date" type="date" defaultValue="2026-03-09" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="i-number">Menge</Label>
        <Input
          id="i-number"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          defaultValue="2,5"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="i-email">E-Mail</Label>
        <Input id="i-email" type="email" autoComplete="email" />
      </div>
    </div>
  ),
};
