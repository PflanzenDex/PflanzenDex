import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { ScrollEntries } from "@/shared/patterns/responsive/entry-list/paging/scroll-entries/scroll-entries";
import { keepTogether } from "@/shared/lib/format";
import { Checkbox } from "@/shared/ui/checkbox";
import { texts } from "@/shared/lib/text-rules/texts";
import { UndoRow } from "@/shared/feedback/undo-row/undo-row";
import type { Held } from "@/shared/feedback/undo-row/use-undo";
import type { WateringDueRow } from "../../../api/reminders-api";
import type { BulkUndo, WaterEntry } from "../use-due-write";
import table from "../watering-list.de.json";

const ui = texts(table);

/** Rows per page (starting value, assumption; US-QS-18). */
const PAGE_SIZE = 3;

const sinceText = (d: WateringDueRow) =>
  d.lastWateredOn === null
    ? ui("since.never")
    : keepTogether(ui("since.days", { days: d.daysSince }));

function Row(props: {
  row: WateringDueRow;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  onWater: () => void;
}) {
  const r = props.row;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
      <Checkbox checked={props.checked} onChange={props.onToggle} rowClassName="min-w-0 flex-1">
        <span>
          <span className="font-medium">{r.name}</span>
          <span className="block text-sm tabular-nums text-muted-foreground">
            {sinceText(r)},{" "}
            {ui("interval", { days: keepTogether(ui("days", { count: r.intervalDays })) })}
          </span>
        </span>
      </Checkbox>
      <Button
        variant="tinted"
        size="sm"
        disabled={props.busy}
        aria-label={ui("waterOne", { name: r.name })}
        onClick={props.onWater}
      >
        {ui("water")}
      </Button>
    </div>
  );
}

/**
 * A plant that stays in its place for the undo window (SG-FEED-03, US-QS-32): its result, and the undo where the write was
 * one plant. A plant of a bulk write shows its result only; the undo sits below the list.
 */
function HeldRow(props: {
  row: WateringDueRow;
  held: Held<WateringDueRow>;
  busy: boolean;
  onUndo: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
      <span className="font-medium">{props.row.name}</span>
      <UndoRow
        result={props.held.result}
        subject={props.row.name}
        busy={props.busy}
        onUndo={props.onUndo}
      />
    </div>
  );
}

/** The one undo of a bulk write, where the bulk button was (US-QS-32). */
function BulkRegion(props: {
  bulk: BulkUndo | null;
  picked: readonly WaterEntry[];
  busy: boolean;
  water: (entries: readonly WaterEntry[]) => void;
}) {
  if (props.bulk)
    return (
      <UndoRow
        result={props.bulk.result}
        subject={props.bulk.subject}
        busy={props.busy}
        onUndo={props.bulk.onUndo}
      />
    );
  // One mark is no bulk entry: the hint says how to get there, the button only shows from two marks (US-QS-32).
  if (props.picked.length < 2)
    return <p className="m-0 text-sm text-muted-foreground">{ui("pickMore")}</p>;
  return (
    <Button
      size="touch"
      className="self-start"
      disabled={props.busy}
      onClick={() => props.water(props.picked)}
    >
      {ui("pickedCount", { count: props.picked.length })}
    </Button>
  );
}

/** One row of the list: a held plant shows its result, a due plant its mark and its button. */
function ItemRow(props: {
  row: WateringDueRow;
  index: number;
  held: Held<WateringDueRow> | undefined;
  checked: boolean;
  busy: boolean;
  toggle: () => void;
  water: (entries: readonly WaterEntry[]) => void;
  undoPlant: (group: string) => void;
}) {
  const { row, held } = props;
  if (held)
    return (
      <HeldRow
        row={row}
        held={held}
        busy={props.busy}
        onUndo={held.undoable ? () => props.undoPlant(held.group) : undefined}
      />
    );
  return (
    <Row
      row={row}
      checked={props.checked}
      busy={props.busy}
      onToggle={props.toggle}
      onWater={() => props.water([{ row, index: props.index }])}
    />
  );
}

/**
 * The due rows with their marks and the one-step pick of several. A changed row stays in its place for the undo window
 * (`held`); its write belongs to `DueList`, which stays mounted while the list is empty (F-0075, US-QS-32).
 */
export function Rows(props: {
  rows: readonly WateringDueRow[];
  held: ReadonlyMap<string, Held<WateringDueRow>>;
  busy: boolean;
  water: (entries: readonly WaterEntry[]) => void;
  undoPlant: (group: string) => void;
  bulk: BulkUndo | null;
}) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setChosen((c) => {
      const next = new Set(c);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const water = (entries: readonly WaterEntry[]) => {
    setChosen(new Set());
    props.water(entries);
  };
  // A held plant is no longer a pick: its row shows the result until the window ends.
  const picked: WaterEntry[] = props.rows
    .map((row, index) => ({ row, index }))
    .filter((e) => chosen.has(e.row.specimenId) && !props.held.has(e.row.specimenId));
  return (
    <div className="flex flex-col gap-3">
      <ScrollEntries
        items={props.rows}
        pageSize={PAGE_SIZE}
        label={ui("pager")}
        getKey={(r) => r.specimenId}
        renderItem={(r) => (
          <ItemRow
            row={r}
            index={props.rows.indexOf(r)}
            held={props.held.get(r.specimenId)}
            checked={chosen.has(r.specimenId)}
            busy={props.busy}
            toggle={() => toggle(r.specimenId)}
            water={water}
            undoPlant={props.undoPlant}
          />
        )}
      />
      <BulkRegion bulk={props.bulk} picked={picked} busy={props.busy} water={water} />
    </div>
  );
}
