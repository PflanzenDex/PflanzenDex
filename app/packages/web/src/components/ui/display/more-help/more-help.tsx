import * as React from "react";
import { cn } from "@/lib/utils";

export type MoreHelpProps = {
  /** The one line of help that is always visible (US-QS-24). */
  children: React.ReactNode;
  /** The longer explanation; it opens behind "Mehr erfahren". */
  more: React.ReactNode;
  className?: string;
};

/**
 * One line of help and, behind "Mehr erfahren", the longer explanation (US-QS-24, DS-61).
 * A native `details`, so it works by keyboard and without script.
 */
export function MoreHelp({ children, more, className }: MoreHelpProps) {
  return (
    <div className={cn("text-sm text-muted-foreground", className)}>
      <p className="m-0">{children}</p>
      <details className="mt-1">
        <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Mehr erfahren
        </summary>
        <div className="mt-1">{more}</div>
      </details>
    </div>
  );
}
