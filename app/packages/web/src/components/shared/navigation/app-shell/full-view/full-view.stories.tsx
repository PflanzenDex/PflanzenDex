import type { Meta, StoryObj } from "@storybook/react-vite";
import { withRouter } from "../../../shell/shell.fixtures";
import { FullView } from "./full-view";

// Catalog of the frame of a sub-page (TE-18, DS-64): the header first, then the content region, no card around the h1.
const meta = {
  title: "shared/FullView",
  component: FullView,
  decorators: [withRouter],
  args: { title: "Passende Angebote", children: <p>Inhalt der Seite</p> },
} satisfies Meta<typeof FullView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { back: { label: "Zurück zur Tauschbörse", to: "/friends/exchange" } },
};
export const WithoutBack: Story = { args: { title: "Prüfliste" } };
