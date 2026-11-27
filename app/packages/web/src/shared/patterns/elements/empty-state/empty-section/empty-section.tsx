import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import type { EmptyStateAction } from "../empty-state";

export type EmptySectionProps = {
  /** The one line that says why the place is empty (SG-STATE-01). It is the only text of the section. */
  text: string;
  /** The next step as a tinted button (SG-BTN-01); a link when it has an `href`. Left out when the section has none. */
  action?: EmptyStateAction;
  className?: string;
};

/**
 * Empty section inside a tab, a sheet or a page (US-QS-32, SG-STATE-01, owner answer Q12): one muted line and at most one
 * tinted action. No frame, no shadow, no illustration and no heading, because the tab, sheet or page already has one.
 */
export function EmptySection({ text, action, className }: EmptySectionProps) {
  return (
    <div className={cn("flex min-w-0 flex-col items-start gap-3", className)}>
      <p className="max-w-prose break-words text-sm text-muted-foreground">{text}</p>
      {action ? (
        action.href !== undefined ? (
          <Button asChild variant="tinted">
            <a href={action.href}>{action.label}</a>
          </Button>
        ) : (
          <Button variant="tinted" onClick={action.onClick}>
            {action.label}
          </Button>
        )
      ) : null}
    </div>
  );
}
