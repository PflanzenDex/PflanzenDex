import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "./label";

// Catalog of the Label states (TE-18): default, required, next to a disabled control and next to an invalid one.
const meta = { title: "ui/Label", component: Label, args: { children: "Name" } } satisfies Meta<
  typeof Label
>;

export default meta;
type Story = StoryObj<typeof meta>;

const field = "peer min-h-[44px] rounded-md border border-border bg-background px-3 text-base";

export const Default: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <input id="l-default" className={field} />
      <Label {...args} htmlFor="l-default" />
    </div>
  ),
};

export const Required: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Label {...args} htmlFor="l-required" required />
      <input id="l-required" required className={field} />
    </div>
  ),
};

export const Focus: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Label {...args} htmlFor="l-focus" />
      <input
        id="l-focus"
        autoFocus
        className={`${field} focus-visible:ring-2 focus-visible:ring-ring`}
      />
    </div>
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <input id="l-disabled" disabled className={`${field} disabled:opacity-50`} />
      <Label {...args} htmlFor="l-disabled" />
    </div>
  ),
};

export const Invalid: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <Label {...args} htmlFor="l-invalid" />
      <input
        id="l-invalid"
        aria-invalid="true"
        aria-describedby="l-invalid-error"
        className={`${field} border-destructive`}
      />
      <p id="l-invalid-error" className="text-sm text-destructive">
        Bitte einen Namen eingeben.
      </p>
    </div>
  ),
};
