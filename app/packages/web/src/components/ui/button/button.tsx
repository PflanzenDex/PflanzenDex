import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Button looks (US-QS-07, DS-34, DS-35). Sizes are by role; every size keeps a 44 px hit area on touch (DS-15). */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 text-center text-sm font-semibold " +
    // Press feedback is a transform only (ADR 0011 decision 5); the motion tokens end it at once under reduced motion.
    "transition-[color,background-color,transform] duration-(--motion-fast) ease-(--ease-enter) active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 " +
    // Forced colors replace the fill; the border keeps the button's boundary visible (US-QS-12, WCAG 1.4.11).
    "forced-colors:border forced-colors:border-[color:ButtonText] " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
    "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-[44px] rounded-pill px-5 py-2",
        sm: "min-h-[44px] rounded-control px-3",
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
    "aria-label"?: string;
  };

/** Icon-only buttons have no visible text, so the accessible name is required by type (DS-17). */
export type ButtonProps = ButtonBaseProps &
  (
    | { size?: Exclude<ButtonVariants["size"], "icon">; "aria-label"?: string }
    | { size: "icon"; "aria-label": string }
  );

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
      children,
      ...props
    },
    ref,
  ) => {
    const classes = cn(buttonVariants({ variant, size }), className);
    if (asChild) {
      return (
        <Slot ref={ref} className={classes} aria-busy={pending || undefined} {...props}>
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
      >
        {pending ? (
          <>
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
            />
            <span className="sr-only">{pendingLabel}</span>
          </>
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
