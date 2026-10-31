import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PageHeader, type PageHeaderProps } from "../page-header/page-header";

type FullViewProps = Omit<PageHeaderProps, "headingId" | "className"> & {
  /** The id of the heading; generated when left out, so the region is always named by the h1. */
  headingId?: string;
  className?: string;
  children: ReactNode;
};

/**
 * The frame of a sub-page or a full-view page (US-QS-14, US-QS-15, issue 1031): the `PageHeader` first, then the content
 * region below it. The header has no card around it; the content region fills the rest of the screen and the page keeps
 * its one h1 while the content loads or fails.
 */
export function FullView(props: FullViewProps) {
  const { children, className, headingId, ...header } = props;
  const generated = useId();
  const id = headingId ?? generated;
  return (
    <section
      aria-labelledby={id}
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col gap-3", className)}
    >
      <PageHeader {...header} headingId={id} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">{children}</div>
    </section>
  );
}
