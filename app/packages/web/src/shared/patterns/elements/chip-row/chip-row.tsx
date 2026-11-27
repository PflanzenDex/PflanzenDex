import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

/**
 * A row of chips (US-QS-15, SG-LIST-06, owner decision 2026-11-21, issue 2417; DS-63): the marked sideways region `chips` of the
 * one-screen gate (`data-scroll-x`) at every size. While the chips fit the row it wraps and does not scroll (`scroll` false);
 * when they do not fit it stays in one line and scrolls sideways inside itself (`scroll` true), the next chip peeking in at
 * the edge. The caller decides by measuring (`useChipsFit`). Every chip is a control of its own, so the row needs no tab stop,
 * and a focused chip scrolls into view by itself. A chip never shrinks and never breaks its text (`whitespace-nowrap`). A
 * scrolling row clips what leaves its box on every side, so it keeps 4 px of padding all round (`p-1`, cancelled by `-m-1`):
 * the focus ring of a chip (2 px ring, 2 px offset) at the top, the start or the bottom is not cut (DS-37, issue 2612).
 */
export function ChipRow(props: { label: string; scroll: boolean; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={props.label}
      data-scroll-x="chips"
      className={cn(
        "flex gap-2",
        props.scroll
          ? "-m-1 overflow-x-auto overscroll-contain p-1 [&>*]:shrink-0 [&>*]:whitespace-nowrap"
          : "flex-wrap [&>*]:shrink-0 [&>*]:whitespace-nowrap",
      )}
    >
      {props.children}
    </div>
  );
}
