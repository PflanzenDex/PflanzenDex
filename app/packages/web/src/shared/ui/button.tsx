import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/shared/lib/utils";
import { NetworkReason, useNetworkGate } from "./button.network-gate";

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
        // Tinted without a border (owner decision 2026-11-20, SG-BTN-01); forced colors keep the boundary from the base class.
        secondary: "bg-accent text-accent-foreground hover:bg-accent/80",
        // Tinted: the secondary action of a group or card (SG-BTN-01): accent fill, dark green text, no border.
        tinted: "bg-accent text-accent-foreground hover:bg-accent/80",
        // Plain: a tertiary action (SG-BTN-01): green text only; the hover fill is the accent.
        plain: "text-primary hover:bg-accent hover:text-accent-foreground",
        // A destructive action that does not confirm anything (SG-BTN-03): red text, labelled with verb and object.
        "destructive-plain": "text-destructive hover:bg-destructive/10",
        // Ghost stays neutral, because tabs, segments, navigation and accordions build on it.
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
        // A full-width row of a grouped list (US-QS-32, SG-SHAPE-03): square, because the group clips its corners; the
        // class merge does not know the pill radius, so the row size leaves it out instead of overriding it.
        row: "h-auto min-h-11 w-full justify-start gap-3 rounded-none px-4 py-3 text-left text-base font-normal",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonVariants = VariantProps<typeof buttonVariants>;

type ButtonBaseProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> &
  Pick<ButtonVariants, "variant"> & {
    /** Renders the single child element instead of a `<button>` (for links). Not with `needsNetwork` (see below). */
    asChild?: boolean;
    /** Shows a spinner, sets `aria-busy` and blocks clicks while an action runs. Not combined with `asChild`. */
    pending?: boolean;
    /** Text announced while pending. German default; callers pass their own wording. */
    pendingLabel?: string;
    "aria-label"?: string;
  };

/**
 * `needsNetwork` (US-QS-30, SG-BTN-05): a control that writes at once cannot wait for the network. Offline it stays
 * focusable and is shown inactive (`aria-disabled`), its press does nothing, and the reason stands next to it, or once
 * below its group in a `NetworkSlot`. A write that `useWriteAction` buffers (US-QS-03) does not set it: it stays active
 * and is sent later. It cannot be combined with `asChild`: the child's own press would run past the gate (thrown).
 */
type NetworkNeed = { needsNetwork?: boolean | undefined };

/** Icon-only buttons have no visible text, so the accessible name is required by type (DS-17). */
export type ButtonProps = ButtonBaseProps &
  NetworkNeed &
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

type ControlProps = ButtonBaseProps & {
  size?: ButtonVariants["size"] | undefined;
};

/** The `<button>` (or the child of `asChild`) with its look and states; the attributes that a gate sets come last. */
const ButtonControl = React.forwardRef<HTMLButtonElement, ControlProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      pending = false,
      pendingLabel = "Lädt …",
      disabled,
      onClick,
      "aria-describedby": describedBy,
      "aria-disabled": ariaDisabled,
      children,
      ...props
    },
    ref,
  ) => {
    const classes = cn(buttonVariants({ variant, size }), className);
    if (asChild) {
      return (
        <Slot
          ref={ref}
          className={classes}
          aria-busy={pending || undefined}
          {...props}
          aria-disabled={ariaDisabled}
          aria-describedby={describedBy}
          onClick={onClick}
        >
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        {...props}
        aria-disabled={ariaDisabled}
        aria-describedby={describedBy}
        onClick={onClick}
      >
        {pending ? <PendingSign label={pendingLabel} /> : null}
        {children}
      </button>
    );
  },
);
ButtonControl.displayName = "ButtonControl";

/** A control that writes at once: the gate is set here, so a plain `Button` never subscribes to the network state. */
const NetworkButton = React.forwardRef<HTMLButtonElement, ControlProps>(
  ({ onClick, "aria-describedby": describedBy, ...props }, ref) => {
    const gate = useNetworkGate(describedBy, onClick);
    return (
      <>
        <ButtonControl
          ref={ref}
          {...props}
          onClick={gate.press}
          aria-describedby={gate.describedBy}
          aria-disabled={gate.offline || props["aria-disabled"] || undefined}
        />
        {gate.inline ? <NetworkReason id={gate.reasonId} /> : null}
      </>
    );
  },
);
NetworkButton.displayName = "NetworkButton";

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ needsNetwork, ...props }, ref) => {
    if (needsNetwork && props.asChild)
      throw new Error("Button: needsNetwork cannot be combined with asChild (US-QS-30)");
    return needsNetwork ? (
      <NetworkButton ref={ref} {...props} />
    ) : (
      <ButtonControl ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
