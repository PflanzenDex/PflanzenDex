import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { useOnline } from "@/shared/platform/browser/network";
import table from "./button.de.json";

const t = texts(table);

/** The reason a control that needs the network gives while the device is offline (US-QS-30, SG-BTN-05). */
export const offlineReason = t("offline");

/**
 * The offline state of a control that needs the network (US-QS-30): offline its press is swallowed, so neither its action
 * nor a form submit runs, and `describedBy` names the reason. Online it changes nothing.
 */
export function useNetworkGate(
  needsNetwork: boolean,
  describedBy: string | undefined,
  onClick: React.MouseEventHandler<HTMLElement> | undefined,
) {
  const online = useOnline();
  const reasonId = React.useId();
  const offline = needsNetwork && !online;
  return {
    offline,
    reasonId,
    describedBy:
      [describedBy, offline ? reasonId : undefined].filter(Boolean).join(" ") || undefined,
    press: offline ? (event: React.MouseEvent<HTMLElement>) => event.preventDefault() : onClick,
  };
}

/** The visible reason next to a control, or for assistive technology only (`inline` false). */
export function NetworkReason(props: { id: string; inline?: boolean }) {
  return (
    <span
      id={props.id}
      className={props.inline === false ? "sr-only" : "text-sm text-muted-foreground"}
    >
      {offlineReason}
    </span>
  );
}

/** Button looks (US-QS-07, DS-34, DS-35). Sizes are by role; every size keeps a 44 px hit area on touch (DS-15). */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 text-center text-sm font-semibold " +
    // Press feedback is a transform only (ADR 0011 decision 5); the motion tokens end it at once under reduced motion.
    "transition-[color,background-color,transform] duration-(--motion-fast) ease-(--ease-enter) active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 " +
    // Forced colors replace the fill; the border keeps the button's boundary visible (US-QS-12, WCAG 1.4.11).
    "forced-colors:border forced-colors:border-[color:ButtonText] " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        // The quiet fill keeps its boundary in the field boundary colour (US-QS-14, WCAG 1.4.11): --input reaches 3:1 on background, card, warning, secondary and muted.
        secondary:
          "border border-input bg-secondary text-secondary-foreground hover:bg-secondary/80",
        // Green marks intent (ADR 0017): the outline carries the primary colour, its border reaches 6:1 (WCAG 1.4.11).
        // Ghost stays neutral, because tabs, segments, navigation and accordions build on it.
        outline:
          "border border-primary bg-transparent text-primary hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-[44px] rounded-pill px-5 py-2",
        sm: "min-h-[44px] min-w-[44px] rounded-control px-3",
        lg: "min-h-[48px] rounded-pill px-6 text-base",
        icon: "min-h-[44px] min-w-[44px] rounded-control",
        touch: "min-h-[48px] w-full rounded-pill px-4 sm:w-auto",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonVariants = VariantProps<typeof buttonVariants>;

type ButtonBaseProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> &
  Pick<ButtonVariants, "variant"> & {
    /** Renders the single child element instead of a `<button>` (for links). */
    asChild?: boolean;
    /** Shows a spinner, sets `aria-busy` and blocks clicks while an action runs. Not combined with `asChild`. */
    pending?: boolean;
    /** Text announced while pending. German default; callers pass their own wording. */
    pendingLabel?: string;
    /**
     * The control writes at once and cannot wait for the network (US-QS-30). Offline it stays focusable and is shown
     * inactive (`aria-disabled`), its press does nothing, and the reason stands next to it (SG-BTN-05). A write that
     * `useWriteAction` buffers keeps the control active: it is sent when the network is back.
     */
    needsNetwork?: boolean;
    /**
     * With `needsNetwork`: the reason is a visible line next to the control (default). `false` for a row without room
     * (a sticky bar): the reason is then read by assistive technology only, and the visible reason is the offline note
     * of the frame (`app/frame/app-shell`).
     */
    reasonInline?: boolean;
    "aria-label"?: string;
  };

/** Icon-only buttons have no visible text, so the accessible name is required by type (DS-17). */
export type ButtonProps = ButtonBaseProps &
  (
    | { size?: Exclude<ButtonVariants["size"], "icon">; "aria-label"?: string }
    | { size: "icon"; "aria-label": string }
  );

/** The spinner of a pending button, with its text for assistive technology (DS-50). */
function PendingSign(props: { label: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
      />
      <span className="sr-only">{props.label}</span>
    </>
  );
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      pending = false,
      pendingLabel = "Lädt…",
      disabled,
      needsNetwork = false,
      reasonInline = true,
      onClick,
      "aria-describedby": ariaDescribedBy,
      children,
      ...props
    },
    ref,
  ) => {
    const gate = useNetworkGate(needsNetwork, ariaDescribedBy, onClick);
    const { offline, describedBy, press } = gate;
    const classes = cn(buttonVariants({ variant, size }), className);
    // One structure in both states (the element is never swapped), so focus stays on the control going offline.
    const control = asChild ? (
      <Slot
        ref={ref}
        className={classes}
        aria-busy={pending || undefined}
        aria-disabled={offline || undefined}
        aria-describedby={describedBy}
        onClick={press}
        {...props}
      >
        {children}
      </Slot>
    ) : (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        aria-disabled={offline || undefined}
        aria-describedby={describedBy}
        onClick={press}
        {...props}
      >
        {pending ? <PendingSign label={pendingLabel} /> : null}
        {children}
      </button>
    );
    return (
      <>
        {control}
        {offline ? <NetworkReason id={gate.reasonId} inline={reasonInline} /> : null}
      </>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
