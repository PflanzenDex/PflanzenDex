import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button/button";
import { withRouter } from "../../../shell/shell.fixtures";
import { PageHeader } from "./page-header";

// Catalog of the header of a sub-page (TE-18, DS-64): the chevron back, the one h1, at most one action.
const meta = {
  title: "shared/PageHeader",
  component: PageHeader,
  decorators: [withRouter],
  args: { title: "Tauschbörse" },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { back: { label: "Zurück zu Freunde", to: "/friends" } } };
export const WithAction: Story = {
  args: {
    back: { label: "Zurück zu Freunde", to: "/friends" },
    action: (
      <Button type="button" variant="outline">
        Geräte
      </Button>
    ),
  },
};
export const WithoutBack: Story = {};
export const SectionHeading: Story = { args: { heading: "h2", title: "Profil" } };
