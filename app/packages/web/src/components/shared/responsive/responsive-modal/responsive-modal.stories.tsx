import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "@/components/ui/button/button";
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

// Controlled and open on load; the wrapper owns the state so that Esc and the close button work as in the app.
export const Open: Story = {
  render: (args) => {
    const [open, setOpen] = useState(true);
    return <ResponsiveModal {...args} open={open} onOpenChange={setOpen} />;
  },
  args: {
    title: "Pflanze bearbeiten",
    description: "Ändere die Angaben.",
    children: <Button>Speichern</Button>,
  },
};
