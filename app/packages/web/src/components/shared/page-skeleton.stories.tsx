import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageSkeleton } from "./page-skeleton";

// Catalog of the PageSkeleton (TE-17, DS-55). Not interactive: the loading state is the component itself.
const meta = { title: "shared/PageSkeleton", component: PageSkeleton } satisfies Meta<
  typeof PageSkeleton
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};
