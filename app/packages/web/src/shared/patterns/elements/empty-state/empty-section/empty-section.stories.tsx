import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptySection } from "./empty-section";

// Catalog of the EmptySection (US-QS-32, SG-STATE-01): one line and at most one tinted action inside a tab, sheet or page.
const meta = { title: "shared/EmptySection", component: EmptySection } satisfies Meta<
  typeof EmptySection
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithAction: Story = {
  args: {
    text: "Noch keine Messung.",
    action: { label: "Messung erfassen", onClick: () => undefined },
  },
};

export const WithoutAction: Story = {
  args: { text: "Keine offene Anfrage." },
};
