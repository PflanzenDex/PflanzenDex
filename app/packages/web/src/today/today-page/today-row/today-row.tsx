import type { ReactNode } from "react";
import type { TodayItem, TodayKind, TodayTarget } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { cn } from "@/lib/utils";
import { keepTogether, overdueChip, withoutOverdue } from "@/lib/format";

/** Where an action leads: the app wires the destination to a view (the modules do not know each other). */
export type TodayDestination = TodayTarget | "collection";

const LABEL: Record<TodayKind, string> = {
  treatment_overdue: "Überfällig",
  treatment_due: "Heute fällig",
  phase_deviation: "Abweichung",
  measurement_etiolated: "Vergeilt",
  specimen_incomplete: "Angaben fehlen",
  buffer_low: "Nachschub",
  equipment_check_due: "Prüfung fällig",
};
const GO: Record<TodayTarget, string> = {
  treatments: "Zu Behandlung",
  care_phases: "Zu Pflegephasen",
  measurements: "Zum Messen",
  hints: "Zu Hinweisen",
  wishlist: "Zur Wunschliste",
  equipment: "Zum Equipment",
};
const CARD =
  "min-w-0 rounded-card bg-card p-3 text-card-foreground shadow-elevation-1 [overflow-wrap:anywhere]";
const URGENT = "border-warning-border bg-warning text-warning-foreground";
export const isTreatment = (item: TodayItem) =>
  item.kind === "treatment_overdue" || item.kind === "treatment_due";

/** The state as a short chip ("10 Tage überfällig"), never a repeated heading and sentence (US-QS-18). */
function chipOf(item: TodayItem): string {
  return (item.kind === "treatment_overdue" ? overdueChip(item.text) : null) ?? LABEL[item.kind];
}

/**
 * One item as a compact row: the state chip, the short text and one action (US-QS-18). The action sentence of the item
 * is not repeated on every row; the action's name says where it leads. `date` is shown only for the most urgent item.
 */
export function TodayRow(props: {
  item: TodayItem;
  date?: string;
  onOpen: (d: TodayDestination) => void;
  /** Replaces the action: the one "Behandlungen" entry on a treatment (US-QS-18). */
  action?: ReactNode;
}) {
  const { item } = props;
  const urgent = isTreatment(item);
  return (
    // The row wraps the action below the text when the two do not fit side by side at a larger text size (issue 1019);
    // the text column keeps a basis of 9 rem, so at normal text the row stays one line as before.
    <div className={cn(CARD, "flex flex-wrap items-center gap-3", urgent && URGENT)}>
      <div className="flex min-w-0 grow basis-36 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <p className="w-fit rounded-control border border-current px-2 text-sm font-semibold tabular-nums">
            {chipOf(item)}
          </p>
          {props.date && <p className="text-xs opacity-80">Stand: {props.date}</p>}
        </div>
        <p className="line-clamp-2 text-sm">
          {keepTogether(item.kind === "treatment_overdue" ? withoutOverdue(item.text) : item.text)}
        </p>
      </div>
      {props.action ?? (
        <Button
          type="button"
          variant="outline"
          className="max-w-full shrink-0"
          // An item about the whole account (buffer, US-WUN-02) has no specimen; its text names the zone instead.
          aria-label={`${GO[item.target]}: ${item.specimenName ?? item.text}`}
          onClick={() => props.onOpen(item.target)}
        >
          {GO[item.target]}
        </Button>
      )}
    </div>
  );
}
