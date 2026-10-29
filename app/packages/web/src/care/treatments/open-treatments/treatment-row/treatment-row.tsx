import type { TreatmentListRow } from "@pflanzendex/core";
import { Sprout } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { keepTogether, overdueChip } from "@/lib/format";
import { ATTENTION_CLASSES } from "../../../shared/notices";
import { dateText } from "../../../shared/text";

/** Rows per page of the layer (starting value, assumption; US-QS-18). */
export const PAGE_SIZE = 3;

/** The status chip of an overdue or due-today row: the status text says it first, the tint only underlines it (never by colour alone). */
const CHIP = new Set(["overdue", "today"]);

export function Row(props: {
  row: TreatmentListRow;
  running: boolean;
  onDone: () => void;
  /** Shown as a section of another page: the specimen name is one heading level lower (US-QS-14). */
  host: boolean;
}) {
  const { row } = props;
  const Name = props.host ? "h4" : "h3";
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-card bg-card p-3 text-card-foreground shadow-elevation-1 [overflow-wrap:anywhere]">
      <span
        aria-hidden="true"
        className="flex size-13 shrink-0 items-center justify-center rounded-tile bg-accent text-accent-foreground"
      >
        <Sprout className="size-6" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Name className="text-[15px] font-semibold">{row.specimenName}</Name>
        <p className="text-[12.5px] text-muted-foreground">Grund: {row.reason}</p>
        <p className="text-[12.5px] text-muted-foreground">Mittel: {row.agent ?? "—"}</p>
        <p className="text-[12.5px] text-muted-foreground">Fällig am: {dateText(row.dueAt)}</p>
        <p
          className={`w-fit rounded-control px-2.5 py-0.5 text-[12.5px] font-semibold ${CHIP.has(row.status.kind) ? ATTENTION_CLASSES : ""}`}
        >
          {overdueChip(row.status.text) ?? keepTogether(row.status.text)}
        </p>
      </div>
      <Button
        type="button"
        size="lg"
        className="shrink-0 rounded-full"
        disabled={props.running}
        aria-label={`${row.reason} bei ${row.specimenName} als erledigt abhaken`}
        onClick={props.onDone}
      >
        Erledigt
      </Button>
    </div>
  );
}
