import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { ToastItem } from "./toast-item/toast-item";
import { ToastProvider, useToast } from "./toast-provider/toast-provider";

// Catalog of the Toast (US-QS-07, DS-56). Light and dark come from the theme toolbar. The items stay for the audit
// (a huge duration); the Interactive story shows the real queue with the viewport above the bottom bar.
const meta = { title: "shared/Toast", component: ToastItem } satisfies Meta<typeof ToastItem>;

export default meta;
type Story = StoryObj<typeof meta>;

const base = { id: 1, kind: "success", duration: 3_600_000 } as const;
const noop = () => undefined;

export const Success: Story = {
  args: { toast: { ...base, message: "Gegossen." }, onDismiss: noop },
};

export const WithUndo: Story = {
  args: {
    toast: {
      ...base,
      message: "Messung gespeichert.",
      action: { label: "Rückgängig", onAction: noop },
    },
    onDismiss: noop,
  },
};

export const ErrorToast: Story = {
  args: {
    toast: { ...base, kind: "error", message: "Das Foto konnte nicht gespeichert werden." },
    onDismiss: noop,
  },
};

export const LongTextNarrow: Story = {
  args: {
    toast: {
      ...base,
      message:
        "Die Änderung an der Monstera Deliciosa Thai Constellation wurde auf diesem Gerät gespeichert.",
      action: { label: "Rückgängig", onAction: noop },
    },
    onDismiss: noop,
  },
};

function Triggers() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2 p-4">
      <Button onClick={() => toast.show({ message: "Gegossen." })}>Bestätigung</Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.show({ message: "Gelöscht.", action: { label: "Rückgängig", onAction: noop } })
        }
      >
        Mit Rückgängig
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.show({ kind: "error", message: "Speichern fehlgeschlagen." })}
      >
        Fehler
      </Button>
    </div>
  );
}

export const Interactive: Story = {
  args: Success.args,
  render: () => (
    <ToastProvider>
      <Triggers />
    </ToastProvider>
  ),
};
