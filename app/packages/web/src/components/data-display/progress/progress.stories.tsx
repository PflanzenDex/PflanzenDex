import type { Meta, StoryObj } from "@storybook/react-vite";
import { Progress } from "./progress";
import { StepIndicator } from "./step-indicator/step-indicator";

// Catalog of Progress and StepIndicator (TE-18, US-QS-07). Light and dark come from the theme toolbar. Not interactive:
// no focus, disabled or invalid state.
const meta = {
  title: "data-display/Progress",
  component: Progress,
  args: { "aria-label": "Aufgaben erledigt", value: 60 },
  decorators: [
    (Story) => (
      <div className="max-w-sm p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const EmptyAndFull: Story = {
  render: () => (
    <div className="grid gap-3">
      <Progress aria-label="Nichts erledigt" value={0} />
      <Progress aria-label="Alles erledigt" value={100} />
    </div>
  ),
};

export const WithValueText: Story = {
  args: { value: 3, max: 5, valueText: "3 von 5 Aufgaben erledigt" },
};

export const Steps: Story = {
  render: () => (
    <div className="grid gap-4">
      <StepIndicator current={1} total={4} name="Art wählen" />
      <StepIndicator current={3} total={4} name="Standort" />
      <StepIndicator current={4} total={4} />
    </div>
  ),
};
