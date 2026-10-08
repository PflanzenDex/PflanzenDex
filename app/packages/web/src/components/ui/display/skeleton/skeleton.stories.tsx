import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton, SkeletonGroup } from "./skeleton";

// Catalog of the Skeleton blocks (TE-18, DS-52, DS-56). Blocks only, never a number (P-08).
// Not interactive: no focus, disabled or invalid state; the loading state is the component itself.
const meta = { title: "ui/Skeleton", component: Skeleton } satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { className: "h-6 w-40" } };

export const CardContainer: Story = {
  render: () => (
    <SkeletonGroup
      label="Lädt…"
      className="flex max-w-sm flex-col gap-2 rounded-lg border border-border bg-card p-4"
    >
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-12 w-full" />
    </SkeletonGroup>
  ),
};
