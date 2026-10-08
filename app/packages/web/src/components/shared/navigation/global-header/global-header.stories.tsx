import type { Meta, StoryObj } from "@storybook/react-vite";
import { GlobalHeader } from "./global-header";
import { withRouter } from "../../shell/shell.fixtures";

// Catalog of the top bar (TE-18): it shows below `md` only, so the viewport stays on the phone preset (360 px).
const meta = {
  title: "shared/GlobalHeader",
  component: GlobalHeader,
  decorators: [withRouter],
} satisfies Meta<typeof GlobalHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
