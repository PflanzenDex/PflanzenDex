import type { TreatmentListRow } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { dateText } from "../../../shared/text";

/** One open treatment of the plant with "Erledigt" (US-BEH-02); a row of the paged list "Offene Behandlungen". */
export function OpenRow(props: { row: TreatmentListRow; busy: boolean; onDone: () => void }) {
  const { row } = props;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
      <span className="min-w-0 text-sm [overflow-wrap:anywhere]">
        <strong>{row.reason}</strong> · {row.status.text}
        <span className="block text-muted-foreground">Fällig am {dateText(row.dueAt)}</span>
      </span>
      <Button
        type="button"
        size="sm"
        disabled={props.busy}
        aria-label={`${row.reason} bei ${row.specimenName} als erledigt abhaken`}
        onClick={props.onDone}
      >
        Erledigt
      </Button>
    </div>
  );
}
