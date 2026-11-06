import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Button } from "@/shared/ui/button/button";
import { ChunkErrorBoundary } from "@/shared/platform/routing/route-boundary/route-boundary";
import { lazyPage } from "@/shared/platform/routing/lazy-page/lazy-page";
import { useLoadingWindow } from "@/shared/platform/routing/lazy-page/loading-window";
import { texts } from "@/shared/lib/text-rules/texts";
import type { SheetPanelProps } from "@/shared/ui/overlays/sheet/sheet-panel/sheet-panel";
import table from "./sheet.de.json";

const t = texts(table);

// Vaul is about 8 kB gzip and only needed once a sheet opens, so it loads on demand (DS-08, US-QS-07).
const loadPanel = () => import("@/shared/ui/overlays/sheet/sheet-panel/sheet-panel");
const SheetPanel = lazyPage(loadPanel);

type SheetState = { open: boolean; setOpen: (open: boolean) => void; opened: boolean };
const SheetContext = React.createContext<SheetState | null>(null);

function useSheet(): SheetState {
  const ctx = React.useContext(SheetContext);
  if (!ctx) throw new Error("Sheet parts must be used inside <Sheet>");
  return ctx;
}

/** Starts fetching the sheet code; a failure here is retried by the real open, which shows the error (P-10). */
function preload(): void {
  void SheetPanel.load().catch(() => undefined);
}

export type SheetProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
};

/**
 * Bottom sheet root (US-QS-07, DS-23). Holds the open state; the Vaul drawer itself is a lazy chunk that loads when
 * the sheet first opens (or earlier on hover, focus, touch and when the browser is idle).
 */
function Sheet({ open: openProp, defaultOpen = false, onOpenChange, children }: SheetProps) {
  const [inner, setInner] = React.useState(defaultOpen);
  const open = openProp ?? inner;
  const [opened, setOpened] = React.useState(open);
  if (open && !opened) setOpened(true);
  const setOpen = React.useCallback(
    (next: boolean) => {
      setInner(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  React.useEffect(() => {
    const id = window.setTimeout(preload, 1500);
    return () => window.clearTimeout(id);
  }, []);
  const value = React.useMemo(() => ({ open, setOpen, opened }), [open, setOpen, opened]);
  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>;
}

export type SheetTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
};

/** Opens the sheet. Works before the drawer code is there; the code is requested on first contact. */
const SheetTrigger = React.forwardRef<HTMLButtonElement, SheetTriggerProps>(
  ({ asChild, onClick, onPointerEnter, onFocus, onTouchStart, ...props }, ref) => {
    const { open, setOpen } = useSheet();
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : "button"}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-state={open ? "open" : "closed"}
        {...props}
        onPointerEnter={(e: React.PointerEvent<HTMLButtonElement>) => {
          preload();
          onPointerEnter?.(e);
        }}
        onFocus={(e: React.FocusEvent<HTMLButtonElement>) => {
          preload();
          onFocus?.(e);
        }}
        onTouchStart={(e: React.TouchEvent<HTMLButtonElement>) => {
          preload();
          onTouchStart?.(e);
        }}
        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
          onClick?.(e);
          if (!e.defaultPrevented) setOpen(!open);
        }}
      />
    );
  },
);
SheetTrigger.displayName = "SheetTrigger";

export type SheetContentProps = Omit<SheetPanelProps, "open" | "onOpenChange">;

/**
 * The loading state of a sheet whose chunk is still on its way (NFR-12, P-10): a centred panel with the same look as the
 * dialog's (US-QS-07). Pinned to the bottom edge it covered the navigation labels on a phone (issue 1575). It takes no
 * focus, so the trigger keeps it while the code loads.
 */
function SheetLoading() {
  return (
    <div
      role="status"
      className="fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-card border border-border bg-background p-6 text-center text-foreground shadow-elevation-2"
    >
      <p className="text-base font-semibold">{t("sheet.loading")}</p>
    </div>
  );
}

/**
 * The sheet panel once its chunk has loaded. Until then it shows the loading state, but only after the delay, so a
 * sheet that is already loaded opens without a flash (US-QS-07, DS-08). The body keeps its boundary: a lazy part inside
 * it waits under the same fallback instead of reaching the route's boundary.
 */
const SheetWindow = React.forwardRef<HTMLDivElement, SheetPanelProps>((props, ref) => {
  const { Component, waiting } = useLoadingWindow(SheetPanel, props.open, props.onOpenChange);
  if (!Component) return waiting ? <SheetLoading /> : null;
  return (
    <React.Suspense fallback={props.open ? <SheetLoading /> : null}>
      <Component ref={ref} {...props} />
    </React.Suspense>
  );
});
SheetWindow.displayName = "SheetWindow";

/** Bottom sheet content (US-QS-07, DS-23, DS-40): see `shared/patterns/elements/sheet-panel`. A failed chunk shows an error with retry. */
const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>((props, ref) => {
  const { open, setOpen, opened } = useSheet();
  if (!opened) return null;
  return (
    <ChunkErrorBoundary
      resetKey="sheet"
      errorView={(retry) =>
        open ? (
          <div
            role="alert"
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-3 border-t border-destructive bg-background p-4 pb-[env(safe-area-inset-bottom)] text-center text-foreground"
          >
            <p className="text-base font-semibold">{t("sheet.loadFailed")}</p>
            <Button variant="outline" onClick={retry}>
              {t("sheet.retry")}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("sheet.close")}
            </Button>
          </div>
        ) : null
      }
    >
      <SheetWindow ref={ref} {...props} open={open} onOpenChange={setOpen} />
    </ChunkErrorBoundary>
  );
});
SheetContent.displayName = "SheetContent";

export { Sheet, SheetContent, SheetTrigger };
