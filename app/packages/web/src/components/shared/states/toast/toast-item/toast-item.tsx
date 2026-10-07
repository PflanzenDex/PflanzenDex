import { CircleAlert, CircleCheck, X } from "lucide-react";
import { useEffect, useRef, type FocusEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ToastKind = "success" | "error";

export type ToastAction = { label: string; onAction: () => void };

export type ToastData = {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
  /** Visible time in ms before the first reading pause; defaults to `toastDuration`. */
  duration?: number;
};

const PER_CHARACTER_MS = 40; // reading time on top of the base (starting value, assumption)

/**
 * How long a toast stays (US-QS-07, P-10): a confirmation 5 s, one with an undo action 8 s, an error 10 s, plus
 * reading time per character. The timer stops while the toast is hovered or focused, so an action is never taken away.
 */
export function toastDuration({
  kind,
  action,
  message,
}: Omit<ToastData, "id" | "duration">): number {
  const base = kind === "error" ? 10_000 : action ? 8_000 : 5_000;
  return base + message.length * PER_CHARACTER_MS;
}

/** Counts down while neither hovered nor focused, and keeps what is left across pauses. */
function useAutoDismiss(duration: number, onExpire: () => void) {
  const expire = useRef(onExpire);
  expire.current = onExpire;
  const left = useRef(duration);
  const since = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const holds = useRef({ pointer: false, focus: false });

  const stop = () => {
    if (timer.current === undefined) return;
    clearTimeout(timer.current);
    timer.current = undefined;
    left.current -= Date.now() - since.current;
  };
  const start = () => {
    since.current = Date.now();
    timer.current = setTimeout(() => expire.current(), Math.max(left.current, 0));
  };
  useEffect(() => {
    start();
    return () => clearTimeout(timer.current);
  }, []);

  const hold = (kind: "pointer" | "focus", on: boolean) => {
    holds.current[kind] = on;
    if (holds.current.pointer || holds.current.focus) stop();
    else if (timer.current === undefined) start();
  };
  return {
    onPointerEnter: () => hold("pointer", true),
    onPointerLeave: () => hold("pointer", false),
    onFocus: () => hold("focus", true),
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) hold("focus", false);
    },
  };
}

/** One toast: message, optional action, close button. Lives inside the viewport's live region (US-QS-07). */
export function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  const handlers = useAutoDismiss(toast.duration ?? toastDuration(toast), onDismiss);
  const Icon = toast.kind === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      {...handlers}
      onKeyDown={(event) => event.key === "Escape" && onDismiss()}
      className={cn(
        "pointer-events-auto flex min-w-0 items-center gap-3 rounded-card border bg-card p-3 pl-4 text-sm text-card-foreground shadow-elevation-2",
        "animate-toast-in motion-reduce:animate-none forced-colors:border-[CanvasText]",
        toast.kind === "error" ? "border-destructive" : "border-primary",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "size-5 shrink-0",
          toast.kind === "error" ? "text-destructive" : "text-primary",
        )}
      />
      <p className="min-w-0 flex-1 break-words">{toast.message}</p>
      {toast.action ? (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-primary"
          onClick={() => {
            toast.action?.onAction();
            onDismiss();
          }}
        >
          {toast.action.label}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Meldung schließen"
        onClick={onDismiss}
        className="-my-1 shrink-0"
      >
        <X aria-hidden="true" className="size-5" />
      </Button>
    </div>
  );
}
