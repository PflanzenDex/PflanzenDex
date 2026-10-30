import type { Meta, StoryObj } from "@storybook/react-vite";
import { withRouter } from "../../shell/shell.fixtures";
import { Button } from "@/components/ui/button/button";
import { LayerHost, LayerOpener, LayerSheet } from "./layer-sheet";

// Catalog of the LayerSheet (US-QS-15, DS-58): bottom sheet at 360 px, dialog at tablet width, pane from 1024 px.
const meta = {
  title: "shared/LayerSheet",
  component: LayerSheet,
  decorators: [withRouter],
  args: {
    id: "licht",
    title: "Lichtzonen",
    primaryAction: <Button>Zone wählen</Button>,
    children: <p>Zone 1 ist Stecklingslicht, Zonen 2 bis 4 sind für ausgewachsene Pflanzen.</p>,
  },
} satisfies Meta<typeof LayerSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

// The opener sits in the frame's content; from 1024 px the layer is the pane beside it (LayerHost, DS-59).
const render: Story["render"] = (args) => (
  <LayerHost>
    <LayerOpener id="licht">Lichtzonen ansehen</LayerOpener>
    <LayerSheet {...args} />
  </LayerHost>
);

export const Closed: Story = { render };
// Open from the address, as after a reload or a copied link: there is no opener to return to.
export const Open: Story = {
  render: (args) => (
    <LayerHost>
      <LayerSheet {...args} />
    </LayerHost>
  ),
  parameters: { path: "/?sheet=licht" },
};
