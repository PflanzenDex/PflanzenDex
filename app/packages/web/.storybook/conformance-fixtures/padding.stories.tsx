import type { Meta, StoryObj } from "@storybook/react-vite";

// Fixture for the QG-U5 / US-QS-07 snapshot self-test (never part of the catalog): a bordered box whose padding
// is an arg, so the self-test can change it by 4 px and prove that the screenshot comparison fails.
const meta = {
  title: "ds-snapshot-fixture/Padding",
  component: ({ padding }: { padding: number }) => (
    <button type="button" className="m-4 min-h-11 border bg-muted" style={{ padding }}>
      Speichern
    </button>
  ),
  args: { padding: 12 },
  argTypes: { padding: { control: "number" } },
} satisfies Meta<{ padding: number }>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
