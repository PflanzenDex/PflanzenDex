import { Suspense, type ReactNode } from "react";
import { SectionLabel } from "@/components/section-label/section-label";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { headingId } from "./use-section-anchor";

/**
 * A section of a destination (US-QS-14): its name is a heading (level 2) the address can point at; the content loads
 * on its own, with a skeleton and one loading status meanwhile (DS-52).
 */
export function AreaSection(props: {
  anchor: string;
  title: string;
  loading: string;
  children: ReactNode;
}) {
  return (
    <section
      id={props.anchor}
      aria-labelledby={headingId(props.anchor)}
      className="flex min-w-0 scroll-mt-4 flex-col gap-3"
    >
      <SectionLabel id={headingId(props.anchor)}>{props.title}</SectionLabel>
      <Suspense
        fallback={
          <SkeletonGroup label={props.loading} className="flex min-w-0 flex-col gap-3">
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
          </SkeletonGroup>
        }
      >
        {props.children}
      </Suspense>
    </section>
  );
}
