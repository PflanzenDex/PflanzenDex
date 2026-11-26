import type { ReactNode, Ref } from "react";
import { cn } from "@/shared/lib/utils";

/**
 * A region of a page that scrolls as a whole, under a title and an action that stay (US-QS-15, SG-LIST-01, SG-LIST-02): the
 * rows before and after a list scroll with it, so the list is not squeezed to a few rows on a small window. It is the marked
 * scroll region of the one-screen gate (`data-scroll-region`, DS-61), takes the room the frame leaves and keeps one row and
 * a bit of its own (`min-h-24`, in rem: at 200 % text the frame scrolls instead). It is a tab stop for the keyboard (WCAG
 * 2.1.1, axe scrollable-region-focusable) and is named for the screen reader. A list inside it (`ScrollEntries` without `fit`)
 * ends with the marker "Das waren alle n" when it is longer than this region.
 */
export function ScrollRegion(props: {
  label: string;
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={props.ref}
      role="region"
      aria-label={props.label}
      data-scroll-region=""
      tabIndex={0}
      className={cn(
        "flex min-h-24 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}
