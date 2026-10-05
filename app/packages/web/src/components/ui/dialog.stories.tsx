import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTrigger } from "./dialog";

// Catalog of the Dialog states (TE-18): closed and open.
const meta = { title: "ui/Dialog", component: Dialog } satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Öffnen</Button>
      </DialogTrigger>
      <DialogContent
        title="Pflanze löschen"
        description="Das kann nicht rückgängig gemacht werden."
      >
        <Button variant="destructive">Löschen</Button>
      </DialogContent>
    </Dialog>
  ),
};

export const Open: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent
        title="Pflanze löschen"
        description="Das kann nicht rückgängig gemacht werden."
      >
        <Button variant="destructive">Löschen</Button>
      </DialogContent>
    </Dialog>
  ),
};
