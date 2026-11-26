import { CircleAlert, Sprout, type LucideIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

export type EmptyStateAction = { label: string } & (
  { onClick: () => void; href?: undefined } | { href: string; onClick?: undefined }
);

export type EmptyStateProps = {
  title: string;
  description?: string;
  /** The next step (P-09). Required in practice: every empty or error view offers one. */
  action?: EmptyStateAction;
  /** A second, plain action beside the filled one (SG-BTN-01, tertiary: text only), e.g. "Zur Sammlung" (US-QS-32). */
  secondary?: EmptyStateAction;
  /** `error` is announced as an alert; `empty` is plain content. */
  variant?: "empty" | "error";
  /** The lucide mark of an empty state (SG-ICON-01, SG-ILLU-02); `Sprout` when the caller passes none. The error has its own mark. */
  icon?: LucideIcon | undefined;
  /** Without the icon tile and with less room: for a state below a notice that already says most of it (issue 1343). */
  compact?: boolean;
  className?: string;
  /** Heading level of the title: 1 when the state is the whole page (its one h1), 2 on a page with its own h1, 3 inside a section of a page (US-QS-14, US-QS-32). */
  level?: 1 | 2 | 3;
  /** Receives the title; it is then focusable (`tabIndex=-1`) so a view can move the focus there when it replaces another (SC 2.4.3). */
  titleRef?: React.Ref<HTMLHeadingElement>;
};

/**
 * The mark of a state, decorative and hidden from assistive technology (SG-ICON-02). An error always draws its own mark,
 * a red circle on a neutral tile, never the green accent tile of an empty place (SG-STATE-03, SG-COLOR-04).
 */
function IconTile({ variant, icon }: { variant: "empty" | "error"; icon: LucideIcon | undefined }) {
  if (variant === "error")
    return (
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-tile bg-muted"
      >
        <CircleAlert aria-hidden="true" className="size-6 text-destructive" />
      </span>
    );
  const Mark = icon ?? Sprout;
  return (
    <span
      aria-hidden="true"
      className="flex size-14 items-center justify-center rounded-tile bg-accent text-accent-foreground"
    >
      <Mark aria-hidden="true" className="size-6" />
    </span>
  );
}

/** The button of an action: a link when it has an `href`, else a button that runs its handler (US-QS-07). */
function ActionControl({ action, variant }: { action: EmptyStateAction; variant: ButtonVariant }) {
  return action.href !== undefined ? (
    <Button asChild variant={variant}>
      <a href={action.href}>{action.label}</a>
    </Button>
  ) : (
    <Button variant={variant} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

type ButtonVariant = "default" | "tinted" | "plain";

/** Empty or error state of a list, table or detail view (US-QS-07, DS-26, P-09): says what happened and what to do next. */
export function EmptyState({
  title,
  description,
  action,
  secondary,
  variant = "empty",
  icon,
  compact = false,
  className,
  level = 2,
  titleRef,
}: EmptyStateProps) {
  const Title = level === 1 ? "h1" : level === 3 ? "h3" : "h2";
  return (
    <div
      role={variant === "error" ? "alert" : undefined}
      className={cn(
        "flex min-w-0 flex-col items-center rounded-card bg-card text-center shadow-elevation-1",
        compact ? "gap-2 p-4" : "gap-4 px-6 py-10",
        variant === "error" && "border border-destructive",
        className,
      )}
    >
      {compact ? null : <IconTile variant={variant} icon={icon} />}
      <Title
        ref={titleRef}
        tabIndex={titleRef ? -1 : undefined}
        className="break-words text-lg font-semibold focus:outline-none"
      >
        {title}
      </Title>
      {description ? (
        <p className="max-w-prose break-words text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? (
        <ActionControl action={action} variant={variant === "error" ? "tinted" : "default"} />
      ) : null}
      {secondary ? <ActionControl action={secondary} variant="plain" /> : null}
    </div>
  );
}
