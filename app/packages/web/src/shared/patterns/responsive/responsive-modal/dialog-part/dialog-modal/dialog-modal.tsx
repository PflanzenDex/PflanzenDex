import * as React from "react";
import { Dialog, DialogContent } from "@/shared/ui/overlays/dialog/dialog";

export type DialogModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  closeLabel?: string;
  onOpenAutoFocus?: (event: Event) => void;
  /** Where the focus goes when the dialog closes; `DialogPart` gives the handler (Radix would focus a trigger that is not rendered here, issue 1247). */
  onCloseAutoFocus?: (event: Event) => void;
  children: React.ReactNode;
};

/**
 * The dialog of a responsive modal from md (US-QS-07, DS-23). Radix brings the focus trap, the scroll lock and the
 * portal, so this module is a lazy chunk (DS-08, NFR-12): `DialogPart` (of `ResponsiveModal`) loads it when a dialog first opens.
 */
export function DialogModal({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  onOpenAutoFocus,
  onCloseAutoFocus,
  children,
}: DialogModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        {...(description ? { description } : {})}
        {...(closeLabel ? { closeLabel } : {})}
        {...(onOpenAutoFocus ? { onOpenAutoFocus } : {})}
        {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
