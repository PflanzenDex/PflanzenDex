import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Button } from "@/components/ui/button/button";
import { ChunkErrorBoundary } from "@/components/routing/route-boundary/route-boundary";
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
import type { SheetPanelProps } from "@/components/sheet-panel/sheet-panel";

// Vaul is about 8 kB gzip and only needed once a sheet opens, so it loads on demand (DS-08, US-QS-07).
const loadPanel = () => import("@/components/sheet-panel/sheet-panel");
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
  void loadPanel().catch(() => undefined);
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

/** Bottom sheet content (US-QS-07, DS-23, DS-40): see `components/sheet-panel`. A failed chunk shows an error with retry. */
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
            <p className="text-base font-semibold">Das Fenster konnte nicht geladen werden.</p>
            <Button variant="outline" onClick={retry}>
              Erneut versuchen
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Schließen
            </Button>
          </div>
        ) : null
      }
    >
      <React.Suspense fallback={null}>
        <SheetPanel ref={ref} {...props} open={open} onOpenChange={setOpen} />
      </React.Suspense>
    </ChunkErrorBoundary>
  );
});
SheetContent.displayName = "SheetContent";

export { Sheet, SheetContent, SheetTrigger };
