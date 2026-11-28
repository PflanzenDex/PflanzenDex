import type { TreatmentListRow } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";
import { UndoRow } from "@/shared/feedback/undo-row/undo-row";
import { keepTogether, overdueChip } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { ROW_ACTION, TREATMENT_TEXT } from "@/shared/lists/grouped-list/group-classes";
import { metaParts } from "@/shared/lists/grouped-list/row-parts/row-parts.meta";
import { ATTENTION_CLASSES } from "../../../shared/notices";
import { dateText } from "../../../shared/text";

/** The status chip of an overdue or due-today row: the status text says it first, the tint only underlines it (never by colour alone). */
const CHIP = new Set(["overdue", "today"]);

/**
 * A row that stays in its place for the undo window (SG-FEED-03, US-QS-32): its result and the undo replace "Abhaken". The row
 * wraps: beside the name (at least its basis wide) the action sits at the trailing edge; at 200 % text on a phone the action
 * moves below the name instead of squeezing it to a few letters (issue 2322).
 */
export interface HeldRowState {
  readonly result: string;
  /** What the undo is about, for the name of its button. */
  readonly subject: string;
  readonly busy: boolean;
  readonly onUndo: () => void;
}

export function Row(props: {
  row: TreatmentListRow;
  running: boolean;
  onDone: () => void;
  /** Shown as a section of another page: the specimen name is one heading level lower (US-QS-14); it stands under its section's heading (SG-LIST-10). */
  host: boolean;
  held?: HeldRowState | undefined;
}) {
  const { row } = props;
  const Name = props.host ? "h5" : "h4";
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-card bg-card p-2 text-card-foreground shadow-elevation-1 [overflow-wrap:anywhere]">
      <div className={cn("flex min-w-0 flex-col gap-0.5", TREATMENT_TEXT)}>
        <Name className="text-base font-semibold">{row.specimenName}</Name>
        <p className="text-label text-muted-foreground">
          {metaParts(`${row.reason} · ${row.agent ?? "kein Mittel"}`)}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p
            className={cn(
              "w-fit rounded-control px-2.5 py-0.5 text-label font-semibold",
              CHIP.has(row.status.kind) && ATTENTION_CLASSES,
            )}
          >
            {overdueChip(row.status.text) ?? keepTogether(row.status.text)}
          </p>
          <p className="text-label tabular-nums text-muted-foreground">{dateText(row.dueAt)}</p>
        </div>
      </div>
      {props.held ? (
        <div className={ROW_ACTION}>
          <UndoRow
            result={props.held.result}
            subject={props.held.subject}
            busy={props.held.busy}
            onUndo={props.held.onUndo}
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="tinted"
          className={ROW_ACTION}
          aria-disabled={props.running || undefined}
          aria-label={`${row.reason} bei ${row.specimenName} als erledigt abhaken`}
          onClick={() => {
            if (!props.running) props.onDone();
          }}
        >
          Abhaken
        </Button>
      )}
    </div>
  );
}
