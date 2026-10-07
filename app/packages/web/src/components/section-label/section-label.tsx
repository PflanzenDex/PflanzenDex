import type { ReactNode } from "react";

/**
 * The name of one group on a page (US-QS-14, direction "Greenhouse"): small, semibold and muted, above the group. It
 * is a real heading (level 2 below the one h1), so the groups can be reached by heading.
 */
export function SectionLabel(props: { id: string; children: ReactNode }) {
  return (
    <h2 id={props.id} className="text-[13px] font-semibold text-muted-foreground">
      {props.children}
    </h2>
  );
}
