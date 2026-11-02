import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button/button";
import { FactGrid } from "./fact-grid";

// Catalog of the FactGrid (US-QS-24): known facts as a grid, unknown ones folded into one line with the next step.
const meta = { title: "shared/FactGrid", component: FactGrid } satisfies Meta<typeof FactGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

const facts = [
  { label: "Botanischer Name", value: "Dracaena trifasciata" },
  { label: "Lichtzone", value: "Zone 2" },
  { label: "Gießregel", value: null },
  { label: "Substrat", value: null },
  { label: "Schwierigkeit", value: "Leicht" },
];

export const Default: Story = {
  args: {
    facts,
    next: (
      <Button type="button" variant="outline" size="sm">
        Artprofil öffnen
      </Button>
    ),
  },
  render: (args) => (
    <div className="max-w-sm p-4">
      <FactGrid {...args} />
    </div>
  ),
};

export const Unknown: Story = {
  args: { facts: facts.map((f) => ({ ...f, value: null })) },
  render: (args) => (
    <div className="max-w-sm p-4">
      <FactGrid {...args} />
    </div>
  ),
};
