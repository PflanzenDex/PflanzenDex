import { Button } from "@/components/ui/button";
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
};

/** Empty or error state of a list, table or detail view (US-QS-07, DS-26, P-09): says what happened and what to do next. */
export function EmptyState({
  title,
  description,
  action,
  variant = "empty",
  className,
}: EmptyStateProps) {
  return (
    <div
      role={variant === "error" ? "alert" : undefined}
      className={cn(
        "flex min-w-0 flex-col items-center gap-3 rounded-lg border border-dashed border-border p-6 text-center",
        variant === "error" && "border-destructive",
        className,
      )}
    >
      <h2 className="break-words text-lg font-semibold">{title}</h2>
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
