import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar } from "./avatar";

// Catalog of the Avatar sizes and fallback (TE-18, US-QS-07). Light and dark come from the theme toolbar. Not
// interactive: no focus, disabled or invalid state.
const meta = {
  title: "data-display/Avatar",
  component: Avatar,
  args: { name: "Anna Beispiel" },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMAGE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'><rect width='8' height='8' fill='%23558b6e'/></svg>";

export const Initials: Story = {};

export const WithImage: Story = { args: { src: IMAGE } };

export const BrokenImageFallsBack: Story = { args: { src: "/gibt-es-nicht.jpg" } };

export const Decorative: Story = { args: { decorative: true } };

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-end gap-4 p-4">
      <Avatar name="Anna Beispiel" size="sm" />
      <Avatar name="Anna Beispiel" size="md" />
      <Avatar name="Anna Beispiel" size="lg" src={IMAGE} />
    </div>
  ),
};
