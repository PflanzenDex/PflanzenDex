import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { ResponsiveModal } from "./responsive-modal";

// Catalog of the ResponsiveModal (TE-17, DS-23): bottom sheet on the phone viewport, dialog on the tablet viewport.
const meta = { title: "shared/ResponsiveModal", component: ResponsiveModal } satisfies Meta<
  typeof ResponsiveModal
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Pflanze bearbeiten",
    description: "Ändere die Angaben.",
    trigger: <Button>Öffnen</Button>,
    children: <Button>Speichern</Button>,
  },
};

export const Open: Story = {
  args: {
    title: "Pflanze bearbeiten",
    description: "Ändere die Angaben.",
    open: true,
    children: <Button>Speichern</Button>,
  },
};
