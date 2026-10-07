import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlantLoader } from "./plant-loader";

// Catalog of the PlantLoader sizes (TE-18, DS-56). Light and dark come from the theme toolbar. Not interactive: no
// focus, disabled or invalid state; the loading state is the component itself.
const meta = { title: "shared/PlantLoader", component: PlantLoader } satisfies Meta<
  typeof PlantLoader
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-end gap-6 p-4">
      <PlantLoader size="sm" label="Lädt klein…" />
      <PlantLoader size="md" label="Lädt mittel…" />
      <PlantLoader size="lg" label="Lädt groß…" />
    </div>
  ),
};

export const OnCard: Story = {
  render: () => (
    <div className="flex max-w-sm items-center gap-3 rounded-card border border-border bg-card p-4">
      <PlantLoader size="lg" />
      <p className="text-muted-foreground">Deine Pflanzen werden geladen.</p>
    </div>
  ),
};
