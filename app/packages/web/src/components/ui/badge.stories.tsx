import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";

// Catalog of every Badge variant (TE-18, DS-35). Not interactive: no focus, disabled or loading state.
const meta = { title: "ui/Badge", component: Badge, args: { children: "Neu" } } satisfies Meta<
  typeof Badge
>;

export default meta;
type Story = StoryObj<typeof meta>;

const variants = ["default", "secondary", "outline", "destructive", "warning"] as const;

export const Default: Story = {};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-2 p-4">
      {variants.map((variant) => (
        <Badge key={variant} {...args} variant={variant}>
          {variant}
        </Badge>
      ))}
    </div>
  ),
};
