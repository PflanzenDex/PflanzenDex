import type { Meta, StoryObj } from "@storybook/react-vite";
import { GlobalHeader } from "./global-header";
import { withRouter } from "../../stories/shell/shell.fixtures";
import { AppBarSlotProvider } from "../../../shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot";
import { PageHeader } from "../../../shared/patterns/navigation/page-header/page-header";

// Catalog of the top bar (TE-18): it shows below `md` only, so the viewport stays on the phone preset (360 px).
const meta = {
  title: "shared/GlobalHeader",
  component: GlobalHeader,
  decorators: [withRouter],
} satisfies Meta<typeof GlobalHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A page with its header claims the bar: the brand waits and the title, the way back and the actions take its place (US-QS-32). */
export const WithPageHeader: Story = {
  decorators: [
    (Story) => (
      <AppBarSlotProvider>
        <Story />
        <PageHeader title="Tauschbörse" back={{ label: "Zurück zu Freunde", to: "/friends" }} />
      </AppBarSlotProvider>
    ),
  ],
};
