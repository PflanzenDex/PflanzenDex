import type { Meta, StoryObj } from "@storybook/react-vite";
import { checkFocusRings } from "@/shared/testing/focus-ring/focus-ring.play";
import { Switch } from "./switch";

// Catalog of the Switch states (TE-18, US-QS-32, SG-CTRL-02): default (off), on, focus, busy (aria-disabled) and invalid. The hit area is
// 44 px high; a setting is normally named and described by `SwitchRow`, the stories name the bare switch by `aria-label`.
const meta = {
  title: "ui/Switch",
  component: Switch,
  args: { "aria-label": "Empfehlungen zeigen", checked: false, onCheckedChange: () => undefined },
  decorators: [
    (Story) => (
      <div className="bg-background p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const On: Story = { args: { checked: true } };

export const Focus: Story = {
  args: { autoFocus: true },
  play: ({ canvasElement }) => checkFocusRings(canvasElement),
};

export const Busy: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <Switch {...args} aria-disabled />
      <Switch {...args} checked aria-disabled />
    </div>
  ),
};

export const Invalid: Story = { args: { invalid: true } };
