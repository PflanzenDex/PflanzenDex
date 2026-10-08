import { Button } from "@/components/ui/button/button";
import { cn } from "@/lib/utils";

export type EmptyStateAction = { label: string } & (
  { onClick: () => void; href?: undefined } | { href: string; onClick?: undefined }
);

export type EmptyStateProps = {
  title: string;
  description?: string;
  /** The next step (P-09). Required in practice: every empty or error view offers one. */
  action?: EmptyStateAction;
  /** `error` is announced as an alert; `empty` is plain content. */
  variant?: "empty" | "error";
  className?: string;
  /** Heading level of the title: 2 on a page, 3 inside a section of a page (US-QS-14). */
  level?: 2 | 3;
  /** Receives the title; it is then focusable (`tabIndex=-1`) so a view can move the focus there when it replaces another (SC 2.4.3). */
  titleRef?: React.Ref<HTMLHeadingElement>;
};

/** Empty or error state of a list, table or detail view (US-QS-07, DS-26, P-09): says what happened and what to do next. */
export function EmptyState({
  title,
  description,
  action,
  variant = "empty",
  className,
  level = 2,
  titleRef,
}: EmptyStateProps) {
  const Title = level === 3 ? "h3" : "h2";
  return (
    <div
      role={variant === "error" ? "alert" : undefined}
      className={cn(
        "flex min-w-0 flex-col items-center gap-4 rounded-card bg-card px-6 py-10 text-center shadow-elevation-1",
        variant === "error" && "border border-destructive",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-tile bg-accent text-2xl text-accent-foreground"
      >
        {variant === "error" ? "!" : "🌱"}
      </span>
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
        action.href !== undefined ? (
          <Button asChild variant={variant === "error" ? "outline" : "default"}>
            <a href={action.href}>{action.label}</a>
          </Button>
        ) : (
          <Button variant={variant === "error" ? "outline" : "default"} onClick={action.onClick}>
            {action.label}
          </Button>
        )
      ) : null}
    </div>
  );
}
