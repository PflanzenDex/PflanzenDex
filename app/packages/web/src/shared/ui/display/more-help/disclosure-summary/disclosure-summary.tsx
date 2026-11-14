import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

/**
 * The summary of a native `details` (US-QS-32, SG-ICON-01, issue 1919): the browser's own triangle is hidden and a
 * lucide chevron stands at the end of the summary. The chevron is decorative (`aria-hidden`); the summary text stays the
 * name of the disclosure. It turns when its own `details` is open: the selector is direct (`details > summary > svg`), so
 * a nested `details` never turns a chevron of its parent. No state is kept; the `open` attribute decides.
 */
export function DisclosureSummary({ className, children, ...props }: ComponentProps<"summary">) {
  return (
    <summary
      {...props}
      className={cn(
        "flex list-none cursor-pointer items-center [&::-webkit-details-marker]:hidden",
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
