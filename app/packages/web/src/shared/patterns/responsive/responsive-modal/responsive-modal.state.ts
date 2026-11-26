import * as React from "react";
import { preloadDialog } from "./dialog-part/dialog-part";

/** Loads the dialog code while the browser is idle, from `md` up (DS-08, NFR-12). */
export function usePreloadDialog(isMd: boolean) {
  React.useEffect(() => {
    if (!isMd) return;
    const id = window.setTimeout(preloadDialog, 1500);
    return () => window.clearTimeout(id);
  }, [isMd]);
}

/** The open state: given by `open`, or kept here; `opened` stays true once the modal has been open (its code stays mounted). */
export function useOpenState(
  openProp: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
) {
  const [inner, setInner] = React.useState(false);
  const open = openProp ?? inner;
  const setOpen = (next: boolean) => {
    setInner(next);
    onOpenChange?.(next);
  };
  const [opened, setOpened] = React.useState(open);
  if (open && !opened) setOpened(true);
  return { open, setOpen, opened };
}
