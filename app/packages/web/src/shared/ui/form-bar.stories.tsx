import type { Meta, StoryObj } from "@storybook/react-vite";
import { FormBar } from "./form-bar";

// Catalog of the form bar (US-QS-32, SG-SHEET-04): "Abbrechen" at the leading edge, the confirming action at the trailing
// edge. Without a container it is a plain row after the fields; a page form's `FormBarRegion` sticks it at the top below md, and
// inside a sheet, a dialog or a pane the container draws it into its own bar outside the scroll region (see `ResponsiveModal`,
// `PinnedBar`; owner decision d-115).
const meta = {
  title: "ui/FormBar",
  component: FormBar,
  args: { formId: "story-form", children: "Sichern", onCancel: () => undefined },
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FormBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Nothing changed yet: the action is inactive (owner answer Q-42). */
export const Disabled: Story = { args: { disabled: true } };

/** The write runs: the pending text shows and the action cannot be pressed twice. */
export const Pending: Story = { args: { pending: true, pendingText: "Sichert …" } };

/** The action deletes: the destructive look, a verb and its object (SG-BTN-03). */
export const Destructive: Story = {
  args: { destructive: true, children: "Konto in 7 Tagen löschen" },
};
