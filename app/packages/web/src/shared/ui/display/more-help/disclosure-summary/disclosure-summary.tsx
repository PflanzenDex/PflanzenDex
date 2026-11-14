import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

/**
 * The summary of a native `details` (US-QS-32, SG-ICON-01, SG-TOUCH-01, SG-TOUCH-02; issues 1919, 1958): the browser's own
 * triangle is hidden and a lucide chevron (20 px) stands at the end of the summary. The row is the target: full width,
 * at least 44 px high, with a visible focus ring. A caller's classes win (tailwind-merge): an inline opener sets its own
 * display and width (`inline-flex w-auto`) and keeps the height. The chevron is decorative (`aria-hidden`); the summary
 * text stays the name of the disclosure. It turns when its own `details` is open: the selector is direct
 * (`details > summary > svg`), so a nested `details` never turns a chevron of its parent. No state is kept; the `open`
 * attribute decides.
 */
export function DisclosureSummary({ className, children, ...props }: ComponentProps<"summary">) {
  return (
    <summary
      {...props}
      className={cn(
        "flex min-h-11 w-full cursor-pointer list-none items-center gap-2 rounded-lg [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
      <ChevronDown
        aria-hidden="true"
        className="ml-auto size-5 shrink-0 self-center text-muted-foreground transition-transform duration-(--motion-base) ease-(--ease-enter) motion-reduce:transition-none [details[open]>summary>&]:rotate-180"
      />
    </summary>
  );
}
