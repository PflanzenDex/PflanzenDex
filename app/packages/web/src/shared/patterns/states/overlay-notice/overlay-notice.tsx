import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

/**
 * A notice that lies over the page and is never part of its flow (DS-54, US-QS-14): fixed just above the bottom bar
 * below 768 px and at the top edge from 768 px, where there is no bottom bar. It covers the content under it and never
 * moves anything, and it lets pointer input through, so the page under it stays usable. The caller announces the text
 * (DS-69), this component only shows it.
 */
export function OverlayNotice({
  title,
  variant = "neutral",
  children,
}: {
  title?: string;
  variant?: "neutral" | "warning";
  children: ReactNode;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-4 z-40 bottom-[calc(var(--bar-clearance,env(safe-area-inset-bottom))+0.5rem)] md:inset-x-[max(1.5rem,calc((100vw-120rem)/2+1.5rem))] md:bottom-auto md:top-[max(1rem,env(safe-area-inset-top))]">
      <div
        className={cn(
          "rounded-card border p-3 text-sm shadow-md break-words",
          variant === "warning"
            ? "border-warning-border bg-warning text-warning-foreground"
            : "border-border bg-card text-card-foreground",
        )}
      >
        {title ? <p className="font-semibold">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
