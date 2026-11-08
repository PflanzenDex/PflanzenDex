import { Suspense, type ReactNode } from "react";
import { SectionLabel } from "@/shared/patterns/elements/section-label/section-label";
import { headingId } from "./use-section-anchor";

/**
 * A section of a destination (US-QS-14): its name is a heading (level 2) the address can point at. Its content loads on
 * its own; while it does, the section shows its skeleton, in the shape of that content (DS-52, issue 1697).
 */
export function AreaSection(props: {
  anchor: string;
  title: string;
  /** The skeleton of the section's content while it loads: its shape, one loading status, after the delay (DS-57). */
  skeleton: ReactNode;
  /** The heading in place of the section label, e.g. the main heading (level 1) of a view of its own (US-QS-17). */
  heading?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={props.anchor}
      aria-labelledby={headingId(props.anchor)}
      className="flex min-w-0 scroll-mt-4 flex-col gap-3"
    >
      {props.heading ?? <SectionLabel id={headingId(props.anchor)}>{props.title}</SectionLabel>}
      <Suspense fallback={props.skeleton}>{props.children}</Suspense>
    </section>
  );
}
