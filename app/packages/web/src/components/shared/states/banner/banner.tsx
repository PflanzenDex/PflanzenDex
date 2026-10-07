import { cva, type VariantProps } from "class-variance-authority";
import { CircleCheck, Info, OctagonAlert, TriangleAlert, X, type LucideIcon } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Banner looks (US-QS-07, DS-34). Colour only supports the meaning: every variant has an icon and text (DS-38). */
const bannerVariants = cva("flex min-w-0 items-start gap-3 rounded-card border p-4 text-sm", {
  variants: {
    variant: {
      info: "border-border bg-secondary text-secondary-foreground",
      success: "border-primary bg-accent text-accent-foreground",
      warning: "border-warning-border bg-warning text-warning-foreground",
      error: "border-destructive bg-card text-card-foreground",
    },
  },
  defaultVariants: { variant: "info" },
});

type BannerVariant = NonNullable<VariantProps<typeof bannerVariants>["variant"]>;

const ICONS: Record<BannerVariant, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: OctagonAlert,
};

export type BannerAction = { label: string; onClick: () => void };

export type BannerProps = Omit<React.HTMLAttributes<HTMLDivElement>, "title"> &
  VariantProps<typeof bannerVariants> & {
    /** Short heading; the text below says what to do next (P-09). */
    title?: string;
    action?: BannerAction;
    /** Shows a close button; the banner stays until the caller takes it away (P-10). */
    onDismiss?: () => void;
    /** Accessible name of the close button (German default). */
    dismissLabel?: string;
  };

/**
 * Persistent inline alert for states that last (offline, unknown zone, failed sync) (US-QS-07, P-09, P-10). `error`
 * is `role="alert"` (read at once), the other variants are `role="status"` (read politely). It never disappears on
 * its own; an action and a dismiss button are optional.
 */
const Banner = React.forwardRef<HTMLDivElement, BannerProps>(
  (
    {
      className,
      variant,
      title,
      action,
      onDismiss,
      dismissLabel = "Hinweis schließen",
      children,
      ...props
    },
    ref,
  ) => {
    const kind: BannerVariant = variant ?? "info";
    const Icon = ICONS[kind];
    return (
      <div
        ref={ref}
        role={kind === "error" ? "alert" : "status"}
        className={cn(bannerVariants({ variant }), "forced-colors:border-[CanvasText]", className)}
        {...props}
      >
        <Icon
          aria-hidden="true"
          className={cn("mt-0.5 size-5 shrink-0", kind === "error" && "text-destructive")}
        />
        <div className="min-w-0 flex-1 break-words">
          {title ? <p className="font-semibold">{title}</p> : null}
          {children ? <div>{children}</div> : null}
          {action ? (
            <Button variant="outline" size="sm" className="mt-2" onClick={action.onClick}>
              {action.label}
            </Button>
          ) : null}
        </div>
        {onDismiss ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={dismissLabel}
            onClick={onDismiss}
            className="-m-2 shrink-0"
          >
            <X aria-hidden="true" className="size-5" />
          </Button>
        ) : null}
      </div>
    );
  },
);
Banner.displayName = "Banner";

export { Banner, bannerVariants };
