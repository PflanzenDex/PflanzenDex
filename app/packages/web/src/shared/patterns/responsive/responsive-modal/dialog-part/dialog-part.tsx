import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Button } from "@/shared/ui/button/button";
import { ChunkErrorBoundary } from "@/shared/platform/routing/route-boundary/route-boundary";
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
import { useLoadingWindow } from "@/shared/platform/routing/lazy-page/loading-window";
import { texts } from "@/shared/lib/text-rules/texts";
import type { DialogModalProps } from "./dialog-modal/dialog-modal";
import table from "./dialog-part.de.json";

const t = texts(table);

// The dialog (Radix: focus trap, scroll lock, portal) is only needed once a dialog opens, so its code is a lazy chunk
// (DS-08, NFR-12). It loads on the first open, or earlier while the browser is idle (`ResponsiveModal`).
const DialogModal = lazyPage(() =>
  import("./dialog-modal/dialog-modal").then((m) => ({ default: m.DialogModal })),
);

/** Starts fetching the dialog code; a failure here is retried by the real open, which shows the error (P-10). */
export function preloadDialog(): void {
  void DialogModal.load().catch(() => undefined);
}

/**
 * The loading state of a dialog whose chunk is still on its way (NFR-12, P-10): a centred panel with the look of the
 * error view. It takes no focus, so the trigger keeps it while the code loads.
 */
function DialogLoading() {
  return (
    <div
      role="status"
      className="fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-card border border-border bg-background p-6 text-center text-foreground shadow-elevation-2"
    >
      <p className="text-base font-semibold">{t("dialog.loading")}</p>
    </div>
  );
}

/**
 * The dialog once its chunk has loaded. Until then it shows the loading state, but only after the delay, so a dialog
 * that is already loaded opens without a flash (US-QS-07, DS-08).
 */
function DialogWindow(props: DialogModalProps) {
  const { Component, waiting } = useLoadingWindow(DialogModal, props.open);
  if (Component) return <Component {...props} />;
  return waiting ? <DialogLoading /> : null;
}

/** The error view of a dialog whose chunk failed: the text, a retry and a way out (P-10, DS-08). */
function DialogLoadFailed(props: { onRetry: () => void; onClose: () => void; closeLabel: string }) {
  return (
    <div
      role="alert"
      className="fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-card border border-destructive bg-background p-6 text-center text-foreground shadow-elevation-2"
    >
      <p className="text-base font-semibold">{t("dialog.loadFailed")}</p>
      <Button variant="outline" onClick={props.onRetry}>
        {t("dialog.retry")}
      </Button>
      <Button variant="ghost" onClick={props.onClose}>
        {props.closeLabel}
      </Button>
    </div>
  );
}

export type DialogPartProps = {
  title: string;
  description?: string | undefined;
  closeLabel?: string | undefined;
  trigger?: React.ReactElement | undefined;
  open: boolean;
  /** The dialog chunk has been needed once; it stays mounted after that (Radix unmounts the content when closed). */
  opened: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenAutoFocus?: ((event: Event) => void) | undefined;
  body: React.ReactNode;
};

/**
 * The dialog of md and up. The trigger stays where it is, so it keeps its focus while the dialog code loads; the dialog
 * itself is a lazy chunk that mounts on the first open (DS-08, NFR-12).
 */
export function DialogPart(props: DialogPartProps) {
  const {
    title,
    description,
    closeLabel,
    trigger,
    open,
    opened,
    onOpenChange,
    onOpenAutoFocus,
    body,
  } = props;
  const opener = React.useRef<HTMLElement>(null);
  return (
    <>
      {trigger ? (
        <Slot
          ref={opener}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-state={open ? "open" : "closed"}
          onPointerEnter={preloadDialog}
          onFocus={preloadDialog}
          onTouchStart={preloadDialog}
          onClick={() => onOpenChange(!open)}
        >
          {trigger}
        </Slot>
      ) : null}
      {opened ? (
        <ChunkErrorBoundary
          resetKey="dialog"
          errorView={(retry) =>
            open ? (
              <DialogLoadFailed
                onRetry={retry}
                onClose={() => onOpenChange(false)}
                closeLabel={closeLabel ?? t("dialog.close")}
              />
            ) : null
          }
        >
          <DialogWindow
            open={open}
            onOpenChange={onOpenChange}
            title={title}
            {...(description ? { description } : {})}
            {...(closeLabel ? { closeLabel } : {})}
            {...(onOpenAutoFocus ? { onOpenAutoFocus } : {})}
            returnFocusTo={opener}
          >
            {body}
          </DialogWindow>
        </ChunkErrorBoundary>
      ) : null}
    </>
  );
}
