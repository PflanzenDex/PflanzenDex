import type { Meta, StoryObj } from "@storybook/react-vite";
import { withRouter } from "@/shared/testing/story-frame/story-frame";
import { pressEscape, waitUntil } from "@/shared/testing/story-frame/story-play";
import { Button } from "@/shared/ui/button";
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

const layerOf = (): Element | null => document.querySelector('[role="dialog"]');

// Opening the layer moves the focus into it, and Escape closes it with the focus back on the opener (US-QS-15, DS-40,
// P-B issue 2432). The play leaves the story closed, so the conformance probes start from the state a keeper starts from.
export const Closed: Story = {
  render,
  play: async ({ canvasElement }) => {
    const opener = canvasElement.querySelector<HTMLElement>('[aria-haspopup="dialog"]');
    if (!opener) throw new Error("play: the opener of the layer is missing");
    opener.click();
    await waitUntil(() => layerOf() !== null, "the layer opens", 5000);
    await waitUntil(
      () => layerOf()?.contains(document.activeElement) === true,
      "the focus moves into the layer",
    );
    pressEscape(document.activeElement ?? document.body);
    await waitUntil(() => layerOf() === null, "the layer closes on Escape", 3000);
    await waitUntil(() => document.activeElement === opener, "the focus returns to the opener");
  },
};

// Open from the address, as after a reload or a copied link: there is no opener to return to.
export const Open: Story = {
  render: (args) => (
    <LayerHost>
      <LayerSheet {...args} />
    </LayerHost>
  ),
  parameters: { path: "/?sheet=licht" },
};
